import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  WaAck,
  WaClientState,
  WaCommand,
  WaInboundMessage,
  WaSendRequest,
  WaSendResult,
  WaStatusSnapshot,
} from '@snapsell/shared';
import type { Logger } from 'pino';
import { type ApiClient, ApiCallError } from './api-client.js';
import type { ServiceConfig } from './config.js';
import { type JournalEntry, Journal } from './journal.js';
import type { IncomingMessage, WaClient, WaClientFactory, WaClientHandlers } from './wa-client.js';

const MEDIA_TYPES = [/^image\/(jpeg|png|webp|gif)$/, /^audio\//, /^application\/pdf$/];
const SENT_REFS_KEPT = 2000;
const HEARTBEAT_MS = 30_000;
const WATCHDOG_MS = 60_000;
const WATCHDOG_TIMEOUT_MS = 20_000;
const WATCHDOG_STRIKES = 3;
const FLUSH_RETRY_MAX_MS = 30_000;
const RECONNECT_MAX_MS = 5 * 60_000;

export class SendError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export interface ServiceDeps {
  api: ApiClient;
  journal: Journal;
  createClient: WaClientFactory;
  logger: Logger;
  /** Overridable in tests (no human-like delays). */
  sleep?: (ms: number) => Promise<void>;
  /** Tests drive timers themselves. */
  timers?: boolean;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Owns the WhatsApp Web connection: reports its lifecycle to the API, journals inbound messages
 * and delivery acks until the API has them, and sends replies at a human pace.
 */
export class WhatsAppService {
  state: WaClientState = 'IDLE';
  private qr: string | null = null;
  private number: string | null = null;
  private error: string | null = null;
  private lastEvent = 'init';

  private client: WaClient | null = null;
  private enabled = false;
  private generation = 0;
  /** The current client's start-up, for tests and shutdown. */
  starting: Promise<void> = Promise.resolve();

  private flushing: Promise<void> | null = null;
  private flushAgain = false;
  private flushTimer: NodeJS.Timeout | null = null;
  private flushDelay = 1000;

  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectDelay = 5000;
  private heartbeat: NodeJS.Timeout | null = null;
  private watchdog: NodeJS.Timeout | null = null;
  private strikes = 0;

  private sendChain: Promise<unknown> = Promise.resolve();
  private lastSendAt = 0;
  private readonly sent = new Map<string, string>();
  private readonly inflight = new Map<string, Promise<WaSendResult>>();
  private readonly providerToRef = new Map<string, string>();

  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly config: ServiceConfig,
    private readonly deps: ServiceDeps,
  ) {
    this.sleep = deps.sleep ?? wait;
  }

  private get log() {
    return this.deps.logger;
  }

  async init() {
    await mkdir(this.config.paths.state, { recursive: true, mode: 0o700 });
    await this.deps.journal.init();
    const saved = await this.readJson<{ enabled?: boolean }>('state.json');
    this.enabled = !!saved?.enabled;
    for (const [ref, id] of (await this.readJson<Array<[string, string]>>('sent.json')) ?? []) {
      this.sent.set(ref, id);
    }
    if (this.deps.timers !== false) {
      this.heartbeat = setInterval(() => void this.postStatus('heartbeat'), HEARTBEAT_MS);
      this.watchdog = setInterval(() => void this.checkHealth(), WATCHDOG_MS);
    }
    void this.flush();
    // Previously linked: reconnect on boot. Otherwise wait for the owner to press Connect.
    if (this.enabled) void this.startClient('boot');
    else void this.postStatus('boot');
  }

  async close() {
    for (const t of [this.flushTimer, this.reconnectTimer]) if (t) clearTimeout(t);
    for (const t of [this.heartbeat, this.watchdog]) if (t) clearInterval(t);
    this.generation++;
    await this.client?.stop();
    this.client = null;
  }

  snapshot(): WaStatusSnapshot {
    return {
      state: this.state,
      event: this.lastEvent,
      qr: this.state === 'QR' ? this.qr : null,
      number: this.number,
      error: this.error,
    };
  }

  // ---------------------------------------------------------------------------
  // Commands from the API
  // ---------------------------------------------------------------------------

  async command(command: WaCommand) {
    switch (command) {
      case 'qr':
        await this.setEnabled(true);
        if (this.client && this.state !== 'DISCONNECTED' && this.state !== 'AUTH_FAILURE') {
          await this.postStatus('qr-requested');
          return;
        }
        await this.startClient('connect');
        return;
      case 'restart':
        await this.setEnabled(true);
        await this.restart('restart');
        return;
      case 'logout':
        await this.setEnabled(false);
        await this.logout();
        return;
    }
  }

  private async setEnabled(enabled: boolean) {
    this.enabled = enabled;
    await this.writeJson('state.json', { enabled });
  }

  private async startClient(reason: string) {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const gen = ++this.generation;
    await this.client?.stop();
    const client = this.deps.createClient();
    this.client = client;
    this.qr = null;
    this.strikes = 0;
    this.setState('STARTING', reason, { error: null });
    // Launching the browser takes tens of seconds; progress is reported through status events.
    this.starting = client.start(this.handlers(gen)).catch(async (err: unknown) => {
      if (gen !== this.generation) return;
      const message = (err as Error).message || 'WhatsApp could not start.';
      this.log.error({ err: message }, 'WhatsApp client failed to start');
      this.setState('DISCONNECTED', 'start_failed', { error: message });
      this.client = null;
      await client.stop().catch(() => {});
      this.scheduleReconnect();
    });
  }

  private async restart(reason: string) {
    this.log.warn({ reason }, 'Restarting WhatsApp client');
    await this.startClient(reason);
  }

  private async logout() {
    this.generation++;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const client = this.client ?? this.deps.createClient();
    this.client = null;
    await client.logout().catch((err: Error) => this.log.warn({ err: err.message }, 'Logout'));
    this.number = null;
    this.setState('IDLE', 'logout', { error: null });
  }

  private scheduleReconnect() {
    if (!this.enabled || this.reconnectTimer) return;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX_MS);
    this.log.info({ delayMs: delay }, 'Reconnecting WhatsApp later');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.startClient('reconnect');
    }, delay);
    this.reconnectTimer.unref?.();
  }

  private handlers(gen: number): WaClientHandlers {
    const live = () => gen === this.generation;
    return {
      onQr: (qr) => {
        if (!live()) return;
        this.qr = qr;
        this.setState('QR', 'qr');
      },
      onAuthenticated: () => live() && this.setState('AUTHENTICATED', 'authenticated'),
      onReady: (number) => {
        if (!live()) return;
        this.number = number ? `+${number.replace(/\D/g, '')}` : null;
        this.reconnectDelay = 5000;
        this.setState('READY', 'ready', { error: null });
      },
      onAuthFailure: (message) => {
        if (!live()) return;
        // The saved session is no longer valid: a new QR scan is needed.
        this.setState('AUTH_FAILURE', 'auth_failure', {
          error: message || 'Authentication failed.',
        });
      },
      onDisconnected: (reason) => {
        if (!live()) return;
        this.client = null;
        if (reason === 'LOGOUT') {
          // Unlinked from the phone: don't reconnect into a QR loop.
          void this.setEnabled(false);
          this.number = null;
          this.setState('DISCONNECTED', 'disconnected', {
            error: 'The device was unlinked from the phone.',
          });
          return;
        }
        this.setState('DISCONNECTED', 'disconnected', { error: reason || 'Disconnected.' });
        this.scheduleReconnect();
      },
      onChangeState: (state) => {
        if (live()) this.log.debug({ state }, 'WhatsApp change_state');
      },
      onMessage: (message) => {
        if (live()) void this.onInbound(message);
      },
      onAck: (providerMessageId, state) => {
        if (!live()) return;
        const ack: WaAck = {
          providerMessageId,
          clientRef: this.providerToRef.get(providerMessageId) ?? null,
          state,
          error: state === 'ERROR' ? 'WhatsApp reported a delivery error.' : null,
        };
        void this.deps.journal
          .append({ kind: 'ack', ack })
          .then(() => this.flush())
          .catch((err: Error) => this.log.error({ err: err.message }, 'Journal write failed'));
      },
    };
  }

  private setState(state: WaClientState, event: string, extra: { error?: string | null } = {}) {
    this.state = state;
    this.lastEvent = event;
    if (state !== 'QR') this.qr = null;
    if (extra.error !== undefined) this.error = extra.error;
    void this.postStatus(event);
  }

  private async postStatus(event: string) {
    try {
      await this.deps.api.postEvent({ kind: 'status', status: { ...this.snapshot(), event } });
    } catch {
      // Best effort: the API also asks for the status, and the heartbeat repeats it.
    }
  }

  // ---------------------------------------------------------------------------
  // Inbound
  // ---------------------------------------------------------------------------

  async onInbound(m: IncomingMessage) {
    const message: WaInboundMessage = {
      providerMessageId: m.providerMessageId,
      chatId: m.chatId,
      phone: m.phone,
      pushName: m.pushName,
      type: m.type,
      body: m.body,
      quotedProviderMessageId: m.quotedProviderMessageId,
      timestamp: m.timestamp,
      media: null,
      mediaError: null,
    };
    let bytes: Buffer | undefined;
    let pendingMedia: { mime: string } | null = null;
    if (m.hasMedia) {
      try {
        const media = await m.downloadMedia();
        if (!media) message.mediaError = 'Media could not be downloaded';
        else if (media.data.length > this.config.maxMediaBytes)
          message.mediaError = 'Media too large';
        else if (!MEDIA_TYPES.some((r) => r.test(media.mime)))
          message.mediaError = 'Unsupported media';
        else {
          bytes = media.data;
          pendingMedia = { mime: media.mime };
        }
      } catch (err) {
        this.log.warn({ err: (err as Error).message }, 'Media download failed');
        message.mediaError = 'Media could not be downloaded';
      }
    }
    try {
      await this.deps.journal.append({ kind: 'message', message, pendingMedia }, bytes);
    } catch (err) {
      this.log.error({ err: (err as Error).message }, 'Journal write failed');
      return;
    }
    await this.flush();
  }

  /** Delivers journal entries to the API in order; stops at the first temporary failure. */
  flush(): Promise<void> {
    if (this.flushing) {
      this.flushAgain = true;
      return this.flushing;
    }
    this.flushing = this.runFlush().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private async runFlush() {
    do {
      this.flushAgain = false;
      for (const entry of await this.deps.journal.list()) {
        try {
          await this.deliver(entry);
        } catch (err) {
          if (err instanceof ApiCallError && err.permanent) {
            this.log.error({ id: entry.id, err: err.message }, 'API rejected a journal entry');
            await this.deps.journal.bury(entry.id);
            continue;
          }
          this.scheduleFlush();
          return;
        }
      }
    } while (this.flushAgain);
    this.flushDelay = 1000;
  }

  private async deliver(entry: JournalEntry) {
    if (entry.kind === 'message') {
      let current = entry;
      if (current.pendingMedia) {
        try {
          const ref = await this.deps.api.uploadMedia(
            await this.deps.journal.readMedia(current.id),
          );
          current = (await this.deps.journal.attachMedia(current, ref)) as typeof current;
        } catch (err) {
          if (!(err instanceof ApiCallError && err.permanent)) throw err;
          current = (await this.deps.journal.attachMedia(
            current,
            null,
            'Media could not be saved',
          )) as typeof current;
        }
      }
      await this.deps.api.postEvent({ kind: 'message', message: current.message });
    } else {
      await this.deps.api.postEvent({ kind: 'ack', ack: entry.ack });
    }
    await this.deps.journal.remove(entry.id);
  }

  private scheduleFlush() {
    if (this.flushTimer) return;
    const delay = this.flushDelay;
    this.flushDelay = Math.min(this.flushDelay * 2, FLUSH_RETRY_MAX_MS);
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, delay);
    this.flushTimer.unref?.();
  }

  // ---------------------------------------------------------------------------
  // Outbound
  // ---------------------------------------------------------------------------

  send(req: WaSendRequest): Promise<WaSendResult> {
    const done = this.sent.get(req.clientRef);
    if (done) return Promise.resolve({ providerMessageId: done, duplicate: true });
    const pending = this.inflight.get(req.clientRef);
    if (pending) return pending;
    if (this.state !== 'READY' || !this.client) {
      return Promise.reject(new SendError('WhatsApp is not connected.', 409, true));
    }
    const run = this.sendChain.then(async () => {
      const [min, max] = this.config.sendGapMs;
      const gap = min + Math.random() * (max - min);
      const waitMs = this.lastSendAt + gap - Date.now();
      if (waitMs > 0) await this.sleep(waitMs);
      const client = this.client;
      if (!client || this.state !== 'READY') {
        throw new SendError('WhatsApp is not connected.', 409, true);
      }
      let providerMessageId: string;
      try {
        providerMessageId = await client.send(req.chatId, req.body);
      } catch (err) {
        throw new SendError((err as Error).message || 'Send failed.', 502, true);
      } finally {
        this.lastSendAt = Date.now();
      }
      this.providerToRef.set(providerMessageId, req.clientRef);
      this.sent.set(req.clientRef, providerMessageId);
      await this.persistSent();
      return { providerMessageId, duplicate: false };
    });
    this.sendChain = run.catch(() => {});
    this.inflight.set(req.clientRef, run);
    void run.finally(() => this.inflight.delete(req.clientRef)).catch(() => {});
    return run;
  }

  private async persistSent() {
    while (this.sent.size > SENT_REFS_KEPT) this.sent.delete(this.sent.keys().next().value!);
    if (this.providerToRef.size > SENT_REFS_KEPT) {
      this.providerToRef.delete(this.providerToRef.keys().next().value!);
    }
    await this.writeJson('sent.json', [...this.sent.entries()]);
  }

  // ---------------------------------------------------------------------------
  // Watchdog
  // ---------------------------------------------------------------------------

  /** Restarts Chromium when WhatsApp Web stops answering while it should be connected. */
  async checkHealth() {
    if (this.state !== 'READY' || !this.client) {
      this.strikes = 0;
      return;
    }
    const client = this.client;
    let ok = false;
    try {
      const state = await Promise.race([
        client.ping(),
        wait(WATCHDOG_TIMEOUT_MS).then(() => {
          throw new Error('timeout');
        }),
      ]);
      ok = state === 'CONNECTED';
    } catch {
      ok = false;
    }
    if (ok) {
      this.strikes = 0;
      return;
    }
    this.strikes++;
    this.log.warn({ strikes: this.strikes }, 'WhatsApp health check failed');
    if (this.strikes >= WATCHDOG_STRIKES) {
      this.strikes = 0;
      await this.restart('watchdog');
    }
  }

  // ---------------------------------------------------------------------------

  private async readJson<T>(name: string): Promise<T | null> {
    try {
      return JSON.parse(await readFile(join(this.config.paths.state, name), 'utf8')) as T;
    } catch {
      return null;
    }
  }

  private async writeJson(name: string, value: unknown) {
    const path = join(this.config.paths.state, name);
    const tmp = `${path}.${randomBytes(4).toString('hex')}.tmp`;
    await writeFile(tmp, JSON.stringify(value), { mode: 0o600 });
    await rename(tmp, path);
  }
}
