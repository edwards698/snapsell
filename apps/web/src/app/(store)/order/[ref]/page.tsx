import { Button, Card, cn, Money } from '@snapsell/ui';
import {
  Check,
  CircleCheck,
  Clock,
  CreditCard,
  Lock,
  MessageCircle,
  Package,
  PartyPopper,
  XCircle,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { OrderAutoRefresh } from '@/components/store/order-refresh';
import { getOrder, getStoreInfo } from '@/lib/store';

export const metadata: Metadata = { title: 'Your order', robots: { index: false } };

export default async function OrderPage({ params, searchParams }: PageProps<'/order/[ref]'>) {
  const { ref } = await params;
  const { t } = await searchParams;
  const [order, store] = await Promise.all([
    getOrder(ref, typeof t === 'string' ? t : ''),
    getStoreInfo(),
  ]);
  if (!order) notFound();

  const expired = order.status === 'EXPIRED' || order.status === 'CANCELLED';
  const paid = order.paymentStatus === 'PAID';
  const collection = order.fulfilmentMethod === 'COLLECTION';
  const shipped = ['READY_FOR_COLLECTION', 'DISPATCHED', 'DELIVERED'].includes(
    order.fulfilmentStatus,
  );
  const steps = [
    { icon: Check, label: 'Order placed', done: true },
    { icon: CreditCard, label: 'Payment received', done: paid },
    { icon: Package, label: 'Preparing', done: paid && order.fulfilmentStatus !== 'UNFULFILLED' },
    {
      icon: collection ? Check : Package,
      label: collection ? 'Ready to collect' : 'On the way',
      done: shipped,
    },
  ];
  const reservedUntil = order.reservedUntil
    ? new Date(order.reservedUntil).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Africa/Lusaka',
      })
    : null;
  const name = order.customerFirstName ? `, ${order.customerFirstName}` : '';

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <OrderAutoRefresh active={!expired && !paid} />
      <div className="text-center">
        <span
          className={cn(
            'mx-auto flex size-14 items-center justify-center rounded-2xl',
            expired
              ? 'bg-muted text-muted-foreground'
              : 'bg-primary-soft text-primary-soft-foreground',
          )}
        >
          {expired ? (
            <XCircle className="size-7" />
          ) : paid ? (
            <PartyPopper className="size-7" />
          ) : (
            <Clock className="size-7" />
          )}
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">
          {order.status === 'CANCELLED'
            ? 'This order was cancelled'
            : expired
              ? 'This order has expired'
              : paid
                ? `Thank you${name}!`
                : `Almost done${name}`}
        </h1>
        <p className="mt-2 text-muted-foreground">
          Order <span className="font-mono font-medium text-foreground">{order.ref}</span>
        </p>
      </div>

      {!expired && !paid && (
        <Card className="mt-8 border-primary/30 bg-primary-soft/40 p-5">
          <div className="flex gap-3">
            <Clock className="mt-0.5 size-5 shrink-0 text-primary" />
            <div className="text-sm">
              <p className="font-semibold">
                {order.paymentStatus === 'FAILED'
                  ? 'The payment didn’t go through.'
                  : 'Waiting for your payment.'}{' '}
                Your items are reserved
                {reservedUntil ? ` until ${reservedUntil}` : ''}.
              </p>
              <p className="mt-1 text-muted-foreground">
                {order.paymentUrl
                  ? 'This page updates by itself as soon as the payment is confirmed.'
                  : 'We’ll send you a secure payment link on your phone. Your order is confirmed as soon as the payment clears.'}
              </p>
            </div>
          </div>
          {order.paymentUrl && (
            <Button asChild size="lg" className="mt-4 w-full">
              <a href={order.paymentUrl}>
                <Lock /> {order.paymentStatus === 'FAILED' ? 'Try paying again' : 'Pay now'} ·{' '}
                <Money minor={order.totalMinor} currency={order.currency} />
              </a>
            </Button>
          )}
        </Card>
      )}
      {paid && !expired && (
        <Card className="mt-8 flex gap-3 border-success/30 bg-success-soft/50 p-5 text-sm">
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" />
          <p>
            <span className="font-semibold">Payment received.</span>{' '}
            {collection
              ? 'We’ll message you when your order is ready to collect.'
              : 'We’re preparing your order for delivery.'}
          </p>
        </Card>
      )}
      {expired && (
        <Card className="mt-8 p-5 text-sm text-muted-foreground">
          {order.status === 'CANCELLED'
            ? 'If you’ve already paid, the shop will contact you about a refund.'
            : 'The reservation ran out before payment, so the items went back on sale.'}{' '}
          <Link href="/" className="font-medium text-primary hover:underline">
            Shop again
          </Link>
        </Card>
      )}

      {!expired && (
        <ol className="mt-8 grid grid-cols-4 gap-2" aria-label="Order progress">
          {steps.map((s, i) => (
            <li key={s.label} className="flex flex-col items-center gap-2 text-center">
              <span
                className={cn(
                  'flex size-9 items-center justify-center rounded-full border-2',
                  s.done
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border-strong text-muted-foreground',
                )}
              >
                <s.icon className="size-4" />
              </span>
              <span className={cn('text-xs', s.done ? 'font-medium' : 'text-muted-foreground')}>
                {s.label}
                <span className="sr-only">
                  {s.done ? ' (done)' : i === steps.findIndex((x) => !x.done) ? ' (next)' : ''}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}

      <Card className="mt-8 p-5 sm:p-6">
        <h2 className="text-base font-semibold">Summary</h2>
        <ul className="mt-3 divide-y divide-border text-sm">
          {order.lines.map((l, i) => (
            <li key={i} className="flex justify-between gap-4 py-3">
              <span>
                {l.quantity} × {l.name}
                {l.variantLabel && (
                  <span className="text-muted-foreground"> · {l.variantLabel}</span>
                )}
              </span>
              <Money minor={l.lineTotalMinor} currency={order.currency} />
            </li>
          ))}
        </ul>
        <dl className="mt-2 grid gap-1.5 border-t border-border pt-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{collection ? 'Collection' : 'Delivery'}</dt>
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
      </Card>

      <p className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <MessageCircle className="size-4" /> Questions? Message {store.name} on WhatsApp with your
        order number.
      </p>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        Keep this page’s link to check your order later.
      </p>
    </div>
  );
}
