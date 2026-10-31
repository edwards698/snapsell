import type { DeliveryState } from '@snapsell/shared';

export type MessageKind = 'TEXT' | 'IMAGE' | 'AUDIO' | 'DOCUMENT' | 'OTHER';

export interface IncomingMessage {
  providerMessageId: string;
  chatId: string;
  phone: string | null;
  pushName: string | null;
  type: MessageKind;
  body: string | null;
  quotedProviderMessageId: string | null;
  /** Milliseconds since the epoch. */
  timestamp: number;
  hasMedia: boolean;
  downloadMedia(): Promise<{ mime: string; data: Buffer } | null>;
}

export interface WaClientHandlers {
  onQr(qr: string): void;
  onAuthenticated(): void;
  onReady(number: string | null): void;
  onAuthFailure(message: string): void;
  onDisconnected(reason: string): void;
  onChangeState(state: string): void;
  onMessage(message: IncomingMessage): void;
  onAck(providerMessageId: string, state: Exclude<DeliveryState, 'PENDING'>): void;
}

/** What the service needs from a WhatsApp connection; whatsapp-web.js in production, a fake in tests. */
export interface WaClient {
  start(handlers: WaClientHandlers): Promise<void>;
  /** Closes the browser but keeps the linked session on disk. */
  stop(): Promise<void>;
  /** Unlinks the device and deletes the session. */
  logout(): Promise<void>;
  send(chatId: string, body: string): Promise<string>;
  /** WhatsApp Web's connection state, e.g. `CONNECTED`; throws if the page is unresponsive. */
  ping(): Promise<string | null>;
}

export type WaClientFactory = () => WaClient;
