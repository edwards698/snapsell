import { z } from 'zod';
import type { FulfilmentStatus, OrderStatus, PaymentStatus } from './enums.js';

export const orderListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  view: z.enum(['all', 'unpaid', 'to_fulfil', 'completed', 'closed', 'attention']).default('all'),
  channel: z.enum(['all', 'WEBSITE', 'WHATSAPP']).default('all'),
  range: z.enum(['today', '7d', '30d', 'all']).default('all'),
  customerId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type OrderListQuery = z.input<typeof orderListQuerySchema>;

export interface OrderListItem {
  id: string;
  ref: string;
  channel: 'WEBSITE' | 'WHATSAPP';
  customer: { id: string; name: string; phone: string };
  itemCount: number;
  totalMinor: number;
  currency: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  fulfilmentStatus: FulfilmentStatus;
  fulfilmentMethod: 'DELIVERY' | 'COLLECTION' | null;
  needsAttention: boolean;
  createdAt: string;
}

export interface PaymentDto {
  id: string;
  orderRef: string;
  provider: string;
  providerLinkId: string | null;
  providerPaymentId: string | null;
  paymentUrl: string | null;
  amountMinor: number;
  currency: string;
  status: string;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookEventDto {
  id: string;
  providerEventId: string;
  type: string;
  signatureValid: boolean;
  status: string;
  outcome: string | null;
  orderRef: string | null;
  createdAt: string;
}

export interface TimelineEntry {
  at: string;
  action: string;
  label: string;
  actor: 'OWNER' | 'SYSTEM' | 'AI';
  detail: string | null;
}

export interface OrderDetail extends OrderListItem {
  deliveryAddress: { line1: string; area?: string; city?: string; notes?: string } | null;
  notes: string | null;
  items: Array<{
    id: string;
    variantId: string;
    productId: string | null;
    name: string;
    variantLabel: string;
    sku: string;
    unitPriceMinor: number;
    quantity: number;
    lineTotalMinor: number;
  }>;
  subtotalMinor: number;
  deliveryFeeMinor: number;
  discountMinor: number;
  reservationExpiresAt: string | null;
  statusUrl: string;
  payments: PaymentDto[];
  webhookEvents: WebhookEventDto[];
  timeline: TimelineEntry[];
  /** Fulfilment steps the owner may take next. */
  nextSteps: FulfilmentStatus[];
  canCancel: boolean;
  canCreatePaymentLink: boolean;
}

export const fulfilmentUpdateSchema = z.object({
  status: z.enum(['PROCESSING', 'READY_FOR_COLLECTION', 'DISPATCHED', 'DELIVERED']),
});

export const cancelOrderSchema = z.object({
  reason: z.string().trim().max(300).default(''),
  /** Paid orders only: put the items back into stock. */
  restock: z.boolean().default(true),
  /** Paid orders only: the owner confirms the customer was refunded outside SnapSell. */
  refunded: z.boolean().default(false),
});
export type CancelOrderInput = z.input<typeof cancelOrderSchema>;

export const customerListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});

export interface CustomerListItem {
  id: string;
  name: string;
  phone: string;
  orderCount: number;
  paidTotalMinor: number;
  currency: string;
  lastOrderAt: string | null;
  createdAt: string;
}

export interface DashboardStats {
  currency: string;
  paidSales30dMinor: number;
  paidOrders30d: number;
  orders30d: number;
  averageOrderMinor: number | null;
  attention: Array<{ ref: string; reason: string; createdAt: string }>;
}
