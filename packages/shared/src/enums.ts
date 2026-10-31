import { z } from 'zod';

// Enums are stored as TEXT in SQLite (with CHECK constraints) and validated with these schemas.
// Keep these lists in sync with packages/db/src/schema.ts, which builds its CHECKs from them.

export const UserRole = z.enum(['OWNER']);
export const ProductStatus = z.enum(['ACTIVE', 'INACTIVE', 'UNAVAILABLE', 'ARCHIVED']);
export const StockMovementReason = z.enum([
  'MANUAL_ADJUST',
  'RESERVE',
  'RELEASE',
  'SALE',
  'RETURN',
  'CORRECTION',
]);
export const SalesChannel = z.enum(['WEBSITE', 'WHATSAPP']);
export const OrderStatus = z.enum([
  'DRAFT',
  'PENDING_CONFIRMATION',
  'PENDING_PAYMENT',
  'CONFIRMED',
  'CANCELLED',
  'EXPIRED',
  'COMPLETED',
]);
export const PaymentStatus = z.enum(['UNPAID', 'LINK_CREATED', 'PAID', 'FAILED', 'REFUNDED']);
export const FulfilmentStatus = z.enum([
  'UNFULFILLED',
  'PROCESSING',
  'READY_FOR_COLLECTION',
  'DISPATCHED',
  'DELIVERED',
]);
export const FulfilmentMethod = z.enum(['DELIVERY', 'COLLECTION']);
export const PaymentProviderName = z.enum(['DEVDRAFT']);
export const PaymentRecordStatus = z.enum([
  'CREATING',
  'LINK_CREATED',
  'PAID',
  'FAILED',
  'EXPIRED',
]);
export const WebhookEventStatus = z.enum(['RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED']);
export const MessageDirection = z.enum(['IN', 'OUT']);
export const MessageAuthor = z.enum(['CUSTOMER', 'AI', 'OWNER', 'SYSTEM']);
export const MessageType = z.enum(['TEXT', 'IMAGE', 'AUDIO', 'DOCUMENT', 'OTHER']);
export const AiDraftStatus = z.enum(['NONE', 'DRAFT', 'APPROVED', 'REJECTED']);
export const ConversationMode = z.enum(['AI_AUTO', 'AI_SUGGEST', 'HUMAN', 'PAUSED']);
export const AiGlobalMode = z.enum(['MANUAL', 'SUGGEST', 'AUTO']);
export const AiOutcome = z.enum([
  'SUGGESTED',
  'APPROVED',
  'AUTO_SENT',
  'DROPPED',
  'ESCALATED',
  'ERROR',
]);
export const AuditActor = z.enum(['OWNER', 'SYSTEM', 'AI']);
export const IntegrationKind = z.enum(['WHATSAPP', 'DEVDRAFT', 'RESEND']);
export const JobStatus = z.enum(['QUEUED', 'RUNNING', 'DONE', 'FAILED', 'CANCELLED']);
export const EmailStatus = z.enum(['SENT', 'LOGGED', 'FAILED']);

export type UserRole = z.infer<typeof UserRole>;
export type OrderStatus = z.infer<typeof OrderStatus>;
export type PaymentStatus = z.infer<typeof PaymentStatus>;
export type FulfilmentStatus = z.infer<typeof FulfilmentStatus>;
export type ConversationMode = z.infer<typeof ConversationMode>;
export type JobStatus = z.infer<typeof JobStatus>;
export type IntegrationKind = z.infer<typeof IntegrationKind>;
