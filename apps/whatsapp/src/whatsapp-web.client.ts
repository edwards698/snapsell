import { rm } from 'node:fs/promises';
import type { Logger } from 'pino';
import QRCode from 'qrcode';
import type WAWebJS from 'whatsapp-web.js';
import type { IncomingMessage, MessageKind, WaClient, WaClientHandlers } from './wa-client.js';

const SKIPPED_CHATS = ['@g.us', '@broadcast', '@newsletter'];

function kindOf(type: string): MessageKind {
  switch (type) {
    case 'chat':
      return 'TEXT';
    case 'image':
    case 'sticker':
      return 'IMAGE';
    case 'audio':
    case 'ptt':
      return 'AUDIO';
    case 'document':
      return 'DOCUMENT';
    default:
      return 'OTHER';
  }
}

const ACK_STATE = { [-1]: 'ERROR', 1: 'SENT', 2: 'DELIVERED', 3: 'READ', 4: 'READ' } as const;

export interface WhatsAppWebOptions {
  authPath: string;
  chromePath: string | undefined;
  logger: Logger;
}

/** whatsapp-web.js adapter. Unofficial: kept behind `WaClient` so it can be swapped later (spec §4.1). */
export class WhatsAppWebClient implements WaClient {
  private client: WAWebJS.Client | null = null;

  constructor(private readonly opts: WhatsAppWebOptions) {}

  async start(h: WaClientHandlers) {
    const { default: pkg } = await import('whatsapp-web.js');
    const { Client, LocalAuth } = pkg;
    const client = new Client({
      authStrategy: new LocalAuth({ dataPath: this.opts.authPath }),
      puppeteer: {
        headless: true,
        executablePath: this.opts.chromePath,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      },
    });
    this.client = client;

    client.on('qr', (qr: string) => {
      QRCode.toDataURL(qr, { margin: 1, width: 320 })
        .then((url) => h.onQr(url))
        .catch((err: Error) => this.opts.logger.error({ err: err.message }, 'QR render failed'));
    });
    client.on('authenticated', () => h.onAuthenticated());
    client.on('ready', () => h.onReady(client.info?.wid?.user ?? null));
    client.on('auth_failure', (m: string) => h.onAuthFailure(String(m)));
    client.on('disconnected', (r: unknown) => h.onDisconnected(String(r)));
    client.on('change_state', (s: unknown) => h.onChangeState(String(s)));
    client.on('message_ack', (msg: WAWebJS.Message, ack: number) => {
      const state = ACK_STATE[ack as keyof typeof ACK_STATE];
      if (state && msg.fromMe) h.onAck(msg.id._serialized, state);
    });
    client.on('message', (msg: WAWebJS.Message) => {
      if (msg.fromMe || SKIPPED_CHATS.some((s) => msg.from.endsWith(s))) return;
      void this.toIncoming(msg)
        .then((m) => h.onMessage(m))
        .catch((err: Error) =>
          this.opts.logger.error({ err: err.message }, 'Could not read inbound message'),
        );
    });

    await client.initialize();
  }

  private async toIncoming(msg: WAWebJS.Message): Promise<IncomingMessage> {
    let phone: string | null = null;
    let pushName: string | null = null;
    try {
      const contact = await msg.getContact();
      phone = contact.number || null;
      pushName = contact.pushname || contact.name || null;
    } catch {
      // Contact lookup can fail on fresh chats; the chat ID still identifies the sender.
    }
    let quoted: string | null = null;
    if (msg.hasQuotedMsg) {
      try {
        quoted = (await msg.getQuotedMessage()).id._serialized;
      } catch {
        quoted = null;
      }
    }
    return {
      providerMessageId: msg.id._serialized,
      chatId: msg.from,
      phone,
      pushName,
      type: kindOf(msg.type),
      body: msg.body || null,
      quotedProviderMessageId: quoted,
      timestamp: (msg.timestamp || Math.floor(Date.now() / 1000)) * 1000,
      hasMedia: msg.hasMedia,
      downloadMedia: async () => {
        const media = await msg.downloadMedia();
        if (!media?.data) return null;
        return {
          mime: media.mimetype.split(';')[0]!.trim(),
          data: Buffer.from(media.data, 'base64'),
        };
      },
    };
  }

  async stop() {
    const client = this.client;
    this.client = null;
    await client?.destroy().catch(() => {});
  }

  async logout() {
    const client = this.client;
    this.client = null;
    if (client) {
      await client.logout().catch(() => {});
      await client.destroy().catch(() => {});
    }
    await rm(this.opts.authPath, { recursive: true, force: true });
  }

  async send(chatId: string, body: string) {
    if (!this.client) throw new Error('WhatsApp is not running.');
    const sent = await this.client.sendMessage(chatId, body);
    return sent.id._serialized;
  }

  async ping() {
    if (!this.client) return null;
    return String(await this.client.getState());
  }
}
