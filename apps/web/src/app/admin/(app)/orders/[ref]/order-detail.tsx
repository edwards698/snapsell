'use client';

import type { FulfilmentStatus, OrderDetail } from '@snapsell/shared';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Money,
  Skeleton,
  Switch,
  Textarea,
  toast,
  Tooltip,
} from '@snapsell/ui';
import {
  ArrowLeft,
  CircleAlert,
  Copy,
  CreditCard,
  ExternalLink,
  Globe,
  MapPin,
  MessageCircle,
  Phone,
  RefreshCw,
  Store,
  Truck,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import {
  FULFILMENT_LABEL,
  OrderStateBadge,
  PaymentBadge,
  timeAgo,
} from '@/components/orders/badges';
import { ApiRequestError } from '@/lib/api';
import { useOrder, useOrderActions } from '@/lib/orders';

const STEP_LABEL: Record<FulfilmentStatus, string> = {
  UNFULFILLED: 'Not started',
  PROCESSING: 'Start preparing',
  READY_FOR_COLLECTION: 'Mark ready to collect',
  DISPATCHED: 'Mark out for delivery',
  DELIVERED: 'Mark as delivered',
};

const errorText = (e: unknown) =>
  e instanceof ApiRequestError ? (Object.values(e.fields)[0] ?? e.message) : 'Something went wrong';

function copy(text: string, label: string) {
  void navigator.clipboard.writeText(text).then(() => toast.success(`${label} copied`));
}

function CancelDialog({
  order,
  open,
  onOpenChange,
}: {
  order: OrderDetail;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const actions = useOrderActions(order.ref);
  const paid = order.paymentStatus === 'PAID';
  const [reason, setReason] = useState('');
  const [restock, setRestock] = useState(true);
  const [refunded, setRefunded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    try {
      await actions.cancel.mutateAsync({ reason, restock, refunded });
      toast.success(`${order.ref} cancelled`);
      onOpenChange(false);
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel {order.ref}?</DialogTitle>
          <DialogDescription>
            {paid
              ? 'This order is paid. Refund the customer through DevDraft first, then record it here.'
              : 'The reserved items go back on sale and the payment link stops working.'}
          </DialogDescription>
        </DialogHeader>
        <Field
          label="Reason"
          hint={paid ? 'Required for paid orders' : 'Optional'}
          error={error ?? undefined}
        >
          <Textarea
            rows={2}
            value={reason}
            onChange={(e) => (setReason(e.target.value), setError(null))}
            maxLength={300}
            className="min-h-16"
          />
        </Field>
        {paid && (
          <div className="grid gap-3 rounded-xl border border-border p-4">
            <label className="flex items-center justify-between gap-4 text-sm">
              Put the items back in stock
              <Switch checked={restock} onCheckedChange={setRestock} />
            </label>
            <label className="flex items-center justify-between gap-4 text-sm">
              The customer has been refunded
              <Switch checked={refunded} onCheckedChange={setRefunded} />
            </label>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Keep order
          </Button>
          <Button variant="danger" loading={actions.cancel.isPending} onClick={() => void submit()}>
            Cancel order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function OrderDetailView({ orderRef }: { orderRef: string }) {
  const { data: order, isPending, isError } = useOrder(orderRef);
  const actions = useOrderActions(orderRef);
  const [cancelOpen, setCancelOpen] = useState(false);

  if (isError) {
    return (
      <Alert tone="danger" title="Order not found">
        <Link href="/admin/orders" className="underline">
          Back to orders
        </Link>
      </Alert>
    );
  }
  if (isPending || !order) {
    return (
      <div className="grid gap-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Skeleton className="h-96 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </div>
    );
  }

  const run = async (fn: () => Promise<unknown>, success: string) => {
    try {
      await fn();
      toast.success(success);
    } catch (e) {
      toast.error(errorText(e));
    }
  };
  const activeLink = order.payments.find((p) => p.status === 'LINK_CREATED');
  const waDigits = order.customer.phone.replace(/\D/g, '');

  return (
    <>
      <Link
        href="/admin/orders"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Orders
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono">{order.ref}</span>
            <OrderStateBadge
              status={order.status}
              paymentStatus={order.paymentStatus}
              fulfilmentStatus={order.fulfilmentStatus}
            />
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-2">
            {order.channel === 'WHATSAPP' ? (
              <MessageCircle className="size-4" />
            ) : (
              <Globe className="size-4" />
            )}
            {order.channel === 'WHATSAPP' ? 'WhatsApp' : 'Website'} order ·{' '}
            {new Date(order.createdAt).toLocaleString('en-GB', {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </span>
        }
        actions={
          <>
            {order.nextSteps.map((s) => (
              <Button
                key={s}
                onClick={() => void run(() => actions.fulfil.mutateAsync(s), FULFILMENT_LABEL[s])}
                loading={actions.fulfil.isPending}
              >
                {STEP_LABEL[s]}
              </Button>
            ))}
            {order.canCancel && (
              <Button variant="outline" onClick={() => setCancelOpen(true)}>
                <X /> Cancel
              </Button>
            )}
          </>
        }
      />

      {order.needsAttention && (
        <Alert tone="danger" title="Needs your attention" className="mb-6">
          <p>
            {order.status === 'CANCELLED' && order.paymentStatus === 'PAID'
              ? 'This order was paid after it was cancelled. Refund the customer through DevDraft.'
              : order.paymentStatus === 'PAID'
                ? 'The payment was verified, but something needs checking – see the timeline (for example, stock ran out before payment).'
                : 'A payment link couldn’t be created or a payment didn’t match. See the timeline for details.'}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-3"
            onClick={() => void run(() => actions.resolve.mutateAsync(), 'Marked as handled')}
          >
            Mark as handled
          </Button>
        </Alert>
      )}

      <div className="grid items-start gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid gap-4 sm:gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Items</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border">
                {order.items.map((i) => (
                  <li key={i.id} className="flex justify-between gap-4 py-3 text-sm">
                    <div>
                      <p className="font-medium">
                        {i.productId ? (
                          <Link href={`/admin/products/${i.productId}`} className="hover:underline">
                            {i.name}
                          </Link>
                        ) : (
                          i.name
                        )}
                        {i.variantLabel && (
                          <span className="text-muted-foreground"> · {i.variantLabel}</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-mono">{i.sku}</span> · {i.quantity} ×{' '}
                        <Money minor={i.unitPriceMinor} currency={order.currency} />
                      </p>
                    </div>
                    <Money
                      minor={i.lineTotalMinor}
                      currency={order.currency}
                      className="font-medium"
                    />
                  </li>
                ))}
              </ul>
              <dl className="mt-2 grid gap-1.5 border-t border-border pt-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd>
                    <Money minor={order.subtotalMinor} currency={order.currency} />
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">
                    {order.fulfilmentMethod === 'DELIVERY' ? 'Delivery' : 'Collection'}
                  </dt>
                  <dd>
                    {order.deliveryFeeMinor ? (
                      <Money minor={order.deliveryFeeMinor} currency={order.currency} />
                    ) : (
                      'Free'
                    )}
                  </dd>
                </div>
                <div className="flex justify-between text-base font-semibold">
                  <dt>Total</dt>
                  <dd>
                    <Money minor={order.totalMinor} currency={order.currency} />
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Payment</CardTitle>
              <PaymentBadge status={order.paymentStatus} />
            </CardHeader>
            <CardContent className="grid gap-4">
              {order.reservationExpiresAt && (
                <p className="text-sm text-muted-foreground">
                  Stock is reserved until{' '}
                  {new Date(order.reservationExpiresAt).toLocaleTimeString('en-GB', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  . Unpaid orders expire after that.
                </p>
              )}
              {activeLink?.paymentUrl && (
                <div className="flex items-center gap-2 rounded-xl bg-muted/70 p-3 text-sm">
                  <CreditCard className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">
                    {activeLink.paymentUrl}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => copy(activeLink.paymentUrl!, 'Payment link')}
                    aria-label="Copy payment link"
                  >
                    <Copy />
                  </Button>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {order.canCreatePaymentLink && !activeLink && (
                  <Button
                    variant="outline"
                    size="sm"
                    loading={actions.paymentLink.isPending}
                    onClick={() =>
                      void run(() => actions.paymentLink.mutateAsync(), 'Payment link created')
                    }
                  >
                    <CreditCard /> Create payment link
                  </Button>
                )}
                {activeLink && order.paymentStatus !== 'PAID' && (
                  <Button
                    variant="outline"
                    size="sm"
                    loading={actions.checkPayment.isPending}
                    onClick={() =>
                      void run(() => actions.checkPayment.mutateAsync(), 'Payment status checked')
                    }
                  >
                    <RefreshCw /> Check payment status
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copy(order.statusUrl, 'Customer order link')}
                >
                  <Copy /> Copy customer link
                </Button>
              </div>
              {order.payments.length > 0 && (
                <ul className="divide-y divide-border rounded-xl border border-border text-sm">
                  {order.payments.map((p) => (
                    <li key={p.id} className="grid gap-0.5 px-4 py-3">
                      <div className="flex justify-between gap-2">
                        <span className="font-medium">
                          <Money minor={p.amountMinor} currency={p.currency} /> via{' '}
                          {p.provider === 'DEVDRAFT' ? 'DevDraft' : p.provider}
                        </span>
                        <Badge
                          size="sm"
                          tone={
                            p.status === 'PAID'
                              ? 'success'
                              : p.status === 'FAILED'
                                ? 'danger'
                                : p.status === 'LINK_CREATED'
                                  ? 'info'
                                  : 'neutral'
                          }
                        >
                          {p.status === 'LINK_CREATED' ? 'Link sent' : p.status.toLowerCase()}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {timeAgo(p.createdAt)}
                        {p.providerLinkId && (
                          <>
                            {' '}
                            · link <span className="font-mono">{p.providerLinkId.slice(0, 8)}</span>
                          </>
                        )}
                        {p.providerPaymentId && (
                          <>
                            {' '}
                            · payment{' '}
                            <span className="font-mono">{p.providerPaymentId.slice(0, 12)}</span>
                          </>
                        )}
                      </p>
                      {p.error && <p className="text-xs text-danger">{p.error}</p>}
                    </li>
                  ))}
                </ul>
              )}
              {order.webhookEvents.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground">
                    DevDraft notifications ({order.webhookEvents.length})
                  </summary>
                  <ul className="mt-2 grid gap-1.5">
                    {order.webhookEvents.map((w) => (
                      <li key={w.id} className="flex justify-between gap-3 text-xs">
                        <span>
                          <span className="font-mono">{w.type}</span> –{' '}
                          {w.outcome ?? w.status.toLowerCase()}
                        </span>
                        <span className="text-muted-foreground">{timeAgo(w.createdAt)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="relative grid gap-5 border-l border-border pl-5">
                {order.timeline.map((e, i) => (
                  <li key={i} className="relative">
                    <span
                      className={cn(
                        'absolute -left-[26px] top-1 size-2.5 rounded-full ring-4 ring-surface',
                        /failed|mismatch|cancelled/.test(e.action)
                          ? 'bg-danger'
                          : e.actor === 'OWNER'
                            ? 'bg-primary'
                            : 'bg-border-strong',
                      )}
                    />
                    <p className="text-sm font-medium">
                      {e.label}
                      {e.detail && (
                        <span className="font-normal text-muted-foreground"> – {e.detail}</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(e.at).toLocaleString('en-GB', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}{' '}
                      · {e.actor === 'OWNER' ? 'You' : 'System'}
                    </p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>

        <aside className="grid gap-4 sm:gap-6 lg:sticky lg:top-24">
          <Card>
            <CardHeader>
              <CardTitle>Customer</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <p className="font-medium">{order.customer.name}</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" asChild>
                  <a href={`tel:+${waDigits}`}>
                    <Phone /> {order.customer.phone}
                  </a>
                </Button>
                <Tooltip content="Opens WhatsApp">
                  <Button variant="outline" size="sm" asChild>
                    <a href={`https://wa.me/${waDigits}`} target="_blank" rel="noreferrer">
                      <MessageCircle /> WhatsApp <ExternalLink className="size-3" />
                    </a>
                  </Button>
                </Tooltip>
              </div>
              <Link
                href={`/admin/orders?customer=${order.customer.id}`}
                className="text-primary hover:underline"
              >
                All orders from this customer
              </Link>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {order.fulfilmentMethod === 'DELIVERY' ? (
                  <Truck className="size-4" />
                ) : (
                  <Store className="size-4" />
                )}
                {order.fulfilmentMethod === 'DELIVERY' ? 'Delivery' : 'Collection'}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {order.deliveryAddress ? (
                <p className="flex gap-2">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span>
                    {[
                      order.deliveryAddress.line1,
                      order.deliveryAddress.area,
                      order.deliveryAddress.city,
                    ]
                      .filter(Boolean)
                      .join(', ')}
                    {order.deliveryAddress.notes && (
                      <span className="block text-muted-foreground">
                        {order.deliveryAddress.notes}
                      </span>
                    )}
                  </span>
                </p>
              ) : (
                <p className="text-muted-foreground">The customer collects from your shop.</p>
              )}
              <p>
                Status:{' '}
                <span className="font-medium">{FULFILMENT_LABEL[order.fulfilmentStatus]}</span>
              </p>
              {order.notes && (
                <p className="flex gap-2 rounded-lg bg-muted/70 p-3">
                  <CircleAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  {order.notes}
                </p>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>

      <CancelDialog order={order} open={cancelOpen} onOpenChange={setCancelOpen} />
    </>
  );
}
