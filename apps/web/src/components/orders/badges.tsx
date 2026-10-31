import type { FulfilmentStatus, OrderStatus, PaymentStatus } from '@snapsell/shared';
import { Badge } from '@snapsell/ui';

const PAYMENT: Record<
  PaymentStatus,
  { label: string; tone: 'neutral' | 'info' | 'success' | 'danger' | 'warning' }
> = {
  UNPAID: { label: 'Unpaid', tone: 'neutral' },
  LINK_CREATED: { label: 'Awaiting payment', tone: 'info' },
  PAID: { label: 'Paid', tone: 'success' },
  FAILED: { label: 'Payment failed', tone: 'danger' },
  REFUNDED: { label: 'Refunded', tone: 'warning' },
};

export const FULFILMENT_LABEL: Record<FulfilmentStatus, string> = {
  UNFULFILLED: 'Not started',
  PROCESSING: 'Preparing',
  READY_FOR_COLLECTION: 'Ready to collect',
  DISPATCHED: 'Out for delivery',
  DELIVERED: 'Delivered',
};

/** One badge summarising where an order is, from the customer's point of view. */
export function OrderStateBadge({
  status,
  paymentStatus,
  fulfilmentStatus,
}: {
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  fulfilmentStatus: FulfilmentStatus;
}) {
  if (status === 'CANCELLED') return <Badge tone="outline">Cancelled</Badge>;
  if (status === 'EXPIRED') return <Badge tone="outline">Expired</Badge>;
  if (status === 'COMPLETED') return <Badge tone="success">Completed</Badge>;
  if (paymentStatus === 'PAID')
    return (
      <Badge tone="primary" dot>
        {FULFILMENT_LABEL[fulfilmentStatus]}
      </Badge>
    );
  const p = PAYMENT[paymentStatus];
  return (
    <Badge tone={p.tone} dot>
      {p.label}
    </Badge>
  );
}

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  const p = PAYMENT[status];
  return <Badge tone={p.tone}>{p.label}</Badge>;
}

export function timeAgo(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
