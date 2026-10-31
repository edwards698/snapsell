import { z } from 'zod';
import {
  AiDraftStatus,
  ConversationMode,
  type FulfilmentStatus,
  MessageType,
  type OrderStatus,
  type PaymentStatus,
} from './enums.js';

type MessageType = z.infer<typeof MessageType>;

// ---------------------------------------------------------------------------
// Delivery state of outgoing messages (messages.delivery_state, free text in the database)
// ---------------------------------------------------------------------------

export const DeliveryState = z.enum(['PENDING', 'SENT', 'DELIVERED', 'READ', 'ERROR']);
export type DeliveryState = z.infer<typeof DeliveryState>;

const DELIVERY_RANK: Record<DeliveryState, number> = {
  PENDING: 0,
  ERROR: 1,
  SENT: 2,
  DELIVERED: 3,
  READ: 4,
};

/** Acks can arrive out of order; a message only ever moves forward (an error never undoes "delivered"). */
export function advanceDeliveryState(current: string | null, next: DeliveryState): DeliveryState {
  const cur = DeliveryState.safeParse(current);
  if (!cur.success) return next;
  return DELIVERY_RANK[next] >= DELIVERY_RANK[cur.data] ? next : cur.data;
}

// ---------------------------------------------------------------------------
// WhatsApp service <-> API protocol (internal, HMAC-signed – BUILD_PLAN D9)
// ---------------------------------------------------------------------------

/** Lifecycle of the WhatsApp Web client inside apps/whatsapp. */
export const WaClientState = z.enum([
  'IDLE',
  'STARTING',
  'QR',
  'AUTHENTICATED',
  'READY',
  'DISCONNECTED',
  'AUTH_FAILURE',
]);
export type WaClientState = z.infer<typeof WaClientState>;

export const waStatusSnapshotSchema = z.object({
  state: WaClientState,
  /** The whatsapp-web.js event that caused this snapshot, for logs. */
  event: z.string().max(40).optional(),
  /** QR code as a PNG data URL while waiting for a scan. Never stored. */
  qr: z.string().max(20_000).nullable().default(null),
  /** Linked number in E.164 once ready. */
  number: z.string().max(20).nullable().default(null),
  error: z.string().max(500).nullable().default(null),
});
export type WaStatusSnapshot = z.infer<typeof waStatusSnapshotSchema>;

export const waMediaRefSchema = z.object({
  fileKey: z.string().max(100),
  mime: z.string().max(100),
  size: z.number().int().nonnegative(),
});
export type WaMediaRef = z.infer<typeof waMediaRefSchema>;

export const waInboundMessageSchema = z.object({
  providerMessageId: z.string().min(1).max(200),
  /** Chat ID to reply to, e.g. `260971234567@c.us` (or a `@lid` ID on newer accounts). */
  chatId: z.string().min(1).max(100),
  /** The sender's phone number (digits) when WhatsApp exposes it. */
  phone: z.string().max(20).nullable().default(null),
  pushName: z.string().max(100).nullable().default(null),
  type: MessageType,
  body: z.string().max(10_000).nullable().default(null),
  quotedProviderMessageId: z.string().max(200).nullable().default(null),
  timestamp: z.number().int().positive(),
  media: waMediaRefSchema.nullable().default(null),
  /** Set when the media could not be downloaded (too large, expired, unsupported). */
  mediaError: z.string().max(200).nullable().default(null),
});
export type WaInboundMessage = z.input<typeof waInboundMessageSchema>;

export const waAckSchema = z.object({
  providerMessageId: z.string().min(1).max(200),
  /** Our `messages.id`, when the service knows it. */
  clientRef: z.string().max(40).nullable().default(null),
  state: DeliveryState.exclude(['PENDING']),
  error: z.string().max(500).nullable().default(null),
});
export type WaAck = z.input<typeof waAckSchema>;

export const waEventSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('status'), status: waStatusSnapshotSchema }),
  z.object({ kind: z.literal('message'), message: waInboundMessageSchema }),
  z.object({ kind: z.literal('ack'), ack: waAckSchema }),
]);
export type WaEvent = z.input<typeof waEventSchema>;

export const waSendSchema = z.object({
  /** Our `messages.id`; the service never sends the same ref twice. */
  clientRef: z.string().min(1).max(40),
  chatId: z.string().min(1).max(100),
  body: z.string().min(1).max(4096),
});
export type WaSendRequest = z.infer<typeof waSendSchema>;

export interface WaSendResult {
  providerMessageId: string;
  duplicate: boolean;
}

export const WaCommand = z.enum(['qr', 'restart', 'logout']);
export type WaCommand = z.infer<typeof WaCommand>;

/** Headers used to sign internal requests: HMAC-SHA256 (hex) of `${timestamp}.${rawBody}`. */
export const INTERNAL_TIMESTAMP_HEADER = 'x-snapsell-timestamp';
export const INTERNAL_SIGNATURE_HEADER = 'x-snapsell-signature';
export const INTERNAL_MAX_SKEW_MS = 5 * 60_000;

// ---------------------------------------------------------------------------
// Admin API
// ---------------------------------------------------------------------------

/** What the owner sees for the WhatsApp integration. */
export interface WhatsAppStatus {
  status: 'NOT_CONFIGURED' | 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED';
  state: WaClientState | 'UNREACHABLE' | null;
  number: string | null;
  qr: string | null;
  lastError: string | null;
  serviceReachable: boolean;
  riskAcknowledgedAt: string | null;
  updatedAt: string | null;
}

export const conversationListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  filter: z.enum(['all', 'unread', 'human']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
export type ConversationListQuery = z.input<typeof conversationListQuerySchema>;

export interface MessageDto {
  id: string;
  conversationId: string;
  direction: 'IN' | 'OUT';
  author: 'CUSTOMER' | 'AI' | 'OWNER' | 'SYSTEM';
  type: MessageType;
  body: string | null;
  media: { mime: string; size: number; url: string | null } | null;
  quotedProviderMessageId: string | null;
  deliveryState: DeliveryState | null;
  aiDraftStatus: z.infer<typeof AiDraftStatus>;
  createdAt: string;
}

export interface ConversationListItem {
  id: string;
  customer: { id: string; name: string; phone: string };
  lastMessage: { body: string | null; type: MessageType; direction: 'IN' | 'OUT' } | null;
  lastMessageAt: string | null;
  unreadCount: number;
  mode: ConversationMode;
  takeoverUntil: string | null;
}

export interface ConversationDetail extends ConversationListItem {
  messages: MessageDto[];
  hasMore: boolean;
  generation: number;
  orders: Array<{
    ref: string;
    totalMinor: number;
    currency: string;
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    fulfilmentStatus: FulfilmentStatus;
    createdAt: string;
  }>;
}

export const sendMessageSchema = z.object({
  body: z.string().trim().min(1, 'Write a message first.').max(4096),
});
export type SendMessageInput = z.input<typeof sendMessageSchema>;

export const takeoverSchema = z.object({
  /** ISO time to hand back to the assistant; null = until released. */
  until: z.iso.datetime({ offset: true }).nullable().default(null),
});
export type TakeoverInput = z.input<typeof takeoverSchema>;

export const setModeSchema = z.object({ mode: ConversationMode });

export interface PresetDto {
  key: string;
  text: string;
}

/** Socket.IO events the admin receives (BUILD_PLAN §12). */
export interface RealtimeEvents {
  'message.new': { conversationId: string; customerName: string; message: MessageDto };
  'message.updated': { conversationId: string; message: MessageDto };
  'conversation.updated': { conversationId: string };
  'whatsapp.status': WhatsAppStatus;
  'stock.changed': { variantIds: string[] };
  'catalog.changed': { productId: string };
}
