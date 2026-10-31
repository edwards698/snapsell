'use client';

import type { ConversationDetail } from '@snapsell/shared';
import { Avatar, Button, Money } from '@snapsell/ui';
import { ExternalLink, Phone, Receipt } from 'lucide-react';
import Link from 'next/link';
import { OrderStateBadge, timeAgo } from '@/components/orders/badges';
import { waLink } from './format';

export function CustomerPanel({ conversation }: { conversation: ConversationDetail }) {
  const { customer, orders } = conversation;
  return (
    <div className="grid gap-6 p-5">
      <div className="flex flex-col items-center text-center">
        <Avatar name={customer.name} className="size-16 text-lg" />
        <h2 className="mt-3 text-base font-semibold tracking-tight">{customer.name}</h2>
        <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">{customer.phone}</p>
        <div className="mt-3 flex gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={`tel:${customer.phone.replace(/\s/g, '')}`}>
              <Phone /> Call
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={waLink(customer.phone)} target="_blank" rel="noreferrer">
              <ExternalLink /> WhatsApp
            </a>
          </Button>
        </div>
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Orders
          </h3>
          {orders.length > 0 && (
            <Link
              href={`/admin/orders?customer=${customer.id}`}
              className="text-xs font-medium text-primary hover:underline"
            >
              View all
            </Link>
          )}
        </div>
        {orders.length === 0 ? (
          <p className="flex items-center gap-2 rounded-xl bg-muted/70 px-3 py-3 text-sm text-muted-foreground">
            <Receipt className="size-4" /> No orders yet.
          </p>
        ) : (
          <ul className="grid gap-1.5">
            {orders.map((o) => (
              <li key={o.ref}>
                <Link
                  href={`/admin/orders/${o.ref}`}
                  className="grid gap-1 rounded-xl border border-border px-3 py-2.5 transition-colors hover:bg-muted"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-medium">{o.ref}</span>
                    <Money minor={o.totalMinor} currency={o.currency} className="text-sm font-medium" />
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <OrderStateBadge
                      status={o.status}
                      paymentStatus={o.paymentStatus}
                      fulfilmentStatus={o.fulfilmentStatus}
                    />
                    <span className="text-xs text-muted-foreground">{timeAgo(o.createdAt)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
