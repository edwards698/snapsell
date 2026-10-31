import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { WaEvent, WaMediaRef } from '@snapsell/shared';
import { pino } from 'pino';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiCallError, type ApiClient } from '../src/api-client.js';
import type { ServiceConfig } from '../src/config.js';
import { signedHeaders } from '../src/hmac.js';
import { Journal } from '../src/journal.js';
import { createHttpServer } from '../src/server.js';
import { SendError, WhatsAppService } from '../src/service.js';
import type { IncomingMessage, WaClient, WaClientHandlers } from '../src/wa-client.js';
import { WhatsAppWebClient } from '../src/whatsapp-web.client.js';

const SECRET = 'test-internal-secret-0123456789abcdef';
const logger = pino({ level: 'silent' });

class FakeApi implements ApiClient {
  up = true;
  events: WaEvent[] = [];
  uploads: Buffer[] = [];
  rejectMedia = false;

  postEvent(event: WaEvent) {
    if (!this.up) return Promise.reject(new ApiCallError('API unreachable', null));
    this.events.push(event);
    return Promise.resolve({ ok: true });
  }

  uploadMedia(bytes: Buffer): Promise<WaMediaRef> {
    if (!this.up) return Promise.reject(new ApiCallError('API unreachable', null));
    if (this.rejectMedia) return Promise.reject(new ApiCallError('Unsupported', 415));
    this.uploads.push(bytes);
    return Promise.resolve({
      fileKey: 'private/2026/10/abc.ogg',
      mime: 'audio/ogg',
      size: bytes.length,
    });
  }

  get messages() {
    return this.events.filter((e) => e.kind === 'message');
  }
}

class FakeClient implements WaClient {
  handlers: WaClientHandlers | null = null;
  sent: Array<{ chatId: string; body: string }> = [];
  stopped = 0;
  loggedOut = 0;

  start(h: WaClientHandlers) {
    this.handlers = h;
    return Promise.resolve();
  }
  stop() {
    this.stopped++;
    return Promise.resolve();
  }
  logout() {
    this.loggedOut++;
    return Promise.resolve();
  }
  send(chatId: string, body: string) {
    this.sent.push({ chatId, body });
    return Promise.resolve(`true_${chatId}_${this.sent.length}`);
  }
  ping() {
    return Promise.resolve('CONNECTED');
  }
}

function inbound(id: string, extra: Partial<IncomingMessage> = {}): IncomingMessage {
  return {
    providerMessageId: id,
    chatId: '260971234567@c.us',
    phone: '260971234567',
    pushName: 'Mwila',
    type: 'TEXT',
    body: `message ${id}`,
    quotedProviderMessageId: null,
    timestamp: Date.now(),
    hasMedia: false,
    downloadMedia: () => Promise.resolve(null),
    ...extra,
  };
}

let dir: string;
let config: ServiceConfig;
let api: FakeApi;
let clients: FakeClient[];
let service: WhatsAppService;

function makeService() {
  return new WhatsAppService(config, {
    api,
    journal: new Journal(config.paths.journal),
    logger,
    timers: false,
    sleep: () => Promise.resolve(),
    createClient: () => {
      const c = new FakeClient();
      clients.push(c);
      return c;
    },
  });
}

async function connect() {
  await service.command('qr');
  clients.at(-1)!.handlers!.onReady('260970000001');
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'snapsell-wa-'));
  config = {
    env: 'test',
    host: '127.0.0.1',
    port: 0,
    apiUrl: 'http://127.0.0.1:1',
    secret: SECRET,
    logLevel: 'silent',
    paths: {
      auth: join(dir, 'wwebjs'),
      journal: join(dir, 'whatsapp/journal'),
      state: join(dir, 'whatsapp'),
    },
    chromePath: undefined,
    maxMediaBytes: 1024 * 1024,
    sendGapMs: [0, 0],
  };
  api = new FakeApi();
  clients = [];
  service = makeService();
  await service.init();
});

afterEach(async () => {
  await service.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('journal', () => {
  it('keeps inbound messages while the API is down and replays them once, in order', async () => {
    api.up = false;
    await service.onInbound(inbound('m1'));
    await service.onInbound(inbound('m2'));
    expect(api.messages).toHaveLength(0);
    expect(await new Journal(config.paths.journal).size()).toBe(2);

    // A restart of this service must not lose them either.
    await service.close();
    service = makeService();
    api.up = true;
    await service.init();
    await service.flush();

    expect(api.messages.map((e) => e.kind === 'message' && e.message.providerMessageId)).toEqual([
      'm1',
      'm2',
    ]);
    expect(await new Journal(config.paths.journal).size()).toBe(0);
    await service.flush();
    expect(api.messages).toHaveLength(2);
  });

  it('uploads media before the message and keeps the message if the API refuses the file', async () => {
    const audio = Buffer.from('OggS fake voice note');
    await service.onInbound(
      inbound('v1', {
        type: 'AUDIO',
        hasMedia: true,
        body: null,
        downloadMedia: () => Promise.resolve({ mime: 'audio/ogg', data: audio }),
      }),
    );
    expect(api.uploads).toHaveLength(1);
    const first = api.messages[0]!;
    expect(first.kind === 'message' && first.message.media?.fileKey).toBe(
      'private/2026/10/abc.ogg',
    );

    api.rejectMedia = true;
    await service.onInbound(
      inbound('v2', {
        type: 'AUDIO',
        hasMedia: true,
        downloadMedia: () => Promise.resolve({ mime: 'audio/ogg', data: audio }),
      }),
    );
    const second = api.messages[1]!;
    expect(second.kind === 'message' && second.message.media).toBeNull();
    expect(second.kind === 'message' && second.message.mediaError).toBe('Media could not be saved');
  });

  it('refuses oversized media without blocking the message', async () => {
    await service.onInbound(
      inbound('big', {
        type: 'IMAGE',
        hasMedia: true,
        downloadMedia: () =>
          Promise.resolve({ mime: 'image/jpeg', data: Buffer.alloc(2 * 1024 * 1024) }),
      }),
    );
    const e = api.messages[0]!;
    expect(e.kind === 'message' && e.message.mediaError).toBe('Media too large');
    expect(api.uploads).toHaveLength(0);
  });
});

describe('sending', () => {
  it('refuses to send until connected (retryable)', async () => {
    await expect(
      service.send({ clientRef: 'r1', chatId: '260971234567@c.us', body: 'Hi' }),
    ).rejects.toMatchObject({ status: 409, retryable: true });
  });

  it('never sends the same clientRef twice, even across a restart of the service', async () => {
    await connect();
    const req = { clientRef: 'r1', chatId: '260971234567@c.us', body: 'Hi' };
    const [a, b] = await Promise.all([service.send(req), service.send(req)]);
    expect(a.providerMessageId).toBe(b.providerMessageId);
    expect(clients.at(-1)!.sent).toHaveLength(1);

    await service.close();
    service = makeService();
    await service.init();
    clients.at(-1)!.handlers!.onReady('260970000001');
    const again = await service.send(req);
    expect(again.duplicate).toBe(true);
    expect(clients.at(-1)!.sent).toHaveLength(0);
  });

  it('journals delivery acks with our message id', async () => {
    await connect();
    const { providerMessageId } = await service.send({
      clientRef: 'msg-1',
      chatId: '260971234567@c.us',
      body: 'Hi',
    });
    clients.at(-1)!.handlers!.onAck(providerMessageId, 'DELIVERED');
    await new Promise((r) => setTimeout(r, 50));
    const ack = api.events.find((e) => e.kind === 'ack');
    expect(ack).toMatchObject({ ack: { clientRef: 'msg-1', state: 'DELIVERED' } });
  });

  it('a send error is reported as retryable', async () => {
    await connect();
    clients.at(-1)!.send = () => Promise.reject(new Error('boom'));
    await expect(
      service.send({ clientRef: 'r2', chatId: 'x@c.us', body: 'Hi' }),
    ).rejects.toBeInstanceOf(SendError);
  });
});

describe('lifecycle', () => {
  it('reports QR → ready, and restart keeps the linked session while logout removes it', async () => {
    await service.command('qr');
    const first = clients.at(-1)!;
    first.handlers!.onQr('data:image/png;base64,AAA');
    expect(service.snapshot()).toMatchObject({ state: 'QR', qr: 'data:image/png;base64,AAA' });
    first.handlers!.onReady('260970000001');
    expect(service.snapshot()).toMatchObject({ state: 'READY', number: '+260970000001', qr: null });

    await service.command('restart');
    expect(first.stopped).toBe(1);
    expect(first.loggedOut).toBe(0);

    await service.command('logout');
    expect(clients.at(-1)!.loggedOut).toBe(1);
    expect(service.snapshot().state).toBe('IDLE');
  });

  it('reconnects on boot only when previously connected', async () => {
    await service.close();
    service = makeService();
    await service.init();
    expect(clients).toHaveLength(0);

    await service.command('qr');
    await service.close();
    service = makeService();
    await service.init();
    expect(clients).toHaveLength(2);
  });

  it('ignores events from a client that was replaced', async () => {
    await service.command('qr');
    const old = clients.at(-1)!;
    await service.command('restart');
    old.handlers!.onReady('260970000009');
    expect(service.snapshot().state).toBe('STARTING');
  });

  it('the watchdog restarts an unresponsive client after three failed checks', async () => {
    await connect();
    const client = clients.at(-1)!;
    client.ping = () => Promise.reject(new Error('page crashed'));
    await service.checkHealth();
    await service.checkHealth();
    expect(clients).toHaveLength(1);
    await service.checkHealth();
    expect(clients).toHaveLength(2);
    expect(client.stopped).toBe(1);
  });

  it('WhatsAppWebClient.stop keeps the LocalAuth folder; logout deletes it', async () => {
    const authPath = join(dir, 'wwebjs');
    mkdirSync(join(authPath, 'session'), { recursive: true });
    writeFileSync(join(authPath, 'session', 'x'), 'session');
    const web = new WhatsAppWebClient({ authPath, chromePath: undefined, logger });
    await web.stop();
    expect(existsSync(authPath)).toBe(true);
    await web.logout();
    expect(existsSync(authPath)).toBe(false);
  });
});

describe('http server', () => {
  it('accepts signed requests and rejects unsigned or stale ones', async () => {
    const server = createHttpServer(service, SECRET, logger);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const body = '{}';
    try {
      const ok = await fetch(`${url}/internal/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...signedHeaders(SECRET, body) },
        body,
      });
      expect(ok.status).toBe(200);
      expect(await ok.json()).toMatchObject({ state: 'IDLE' });

      const unsigned = await fetch(`${url}/internal/status`, { method: 'POST', body });
      expect(unsigned.status).toBe(401);

      const stale = await fetch(`${url}/internal/command`, {
        method: 'POST',
        headers: signedHeaders(SECRET, '{"command":"logout"}', Date.now() - 10 * 60_000),
        body: '{"command":"logout"}',
      });
      expect(stale.status).toBe(401);

      const health = await fetch(`${url}/health`);
      expect(await health.json()).toEqual({ ok: true, state: 'IDLE' });
    } finally {
      server.close();
    }
  });
});
