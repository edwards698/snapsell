'use client';

import type { OrderListQuery } from '@snapsell/shared';
import {
  Card,
  cn,
  EmptyState,
  Input,
  Money,
  Pagination,
  SegmentedControl,
  Select,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@snapsell/ui';
import { CircleAlert, Globe, MessageCircle, Receipt, Search, SearchX } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { OrderStateBadge, timeAgo } from '@/components/orders/badges';
import { useDebounced } from '@/lib/catalog';
import { useOrders } from '@/lib/orders';

const VIEWS = [
  { value: 'all', label: 'All' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'to_fulfil', label: 'To fulfil' },
  { value: 'completed', label: 'Completed' },
  { value: 'closed', label: 'Cancelled & expired' },
  { value: 'attention', label: 'Needs attention' },
] as const;

const ChannelIcon = ({ channel }: { channel: string }) =>
  channel === 'WHATSAPP' ? (
    <MessageCircle className="size-4 text-muted-foreground" aria-label="WhatsApp" />
  ) : (
    <Globe className="size-4 text-muted-foreground" aria-label="Website" />
  );

export function OrdersPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const q = useDebounced(search);
  const query: OrderListQuery = {
    q: q || undefined,
    view: (params.get('view') as OrderListQuery['view']) ?? 'all',
    channel: (params.get('channel') as OrderListQuery['channel']) ?? 'all',
    range: (params.get('range') as OrderListQuery['range']) ?? 'all',
    customerId: params.get('customer') ?? undefined,
    page: Number(params.get('page') ?? 1),
  };
  const { data, isPending, isFetching } = useOrders(query);

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (!value || value === 'all') next.delete(key);
    else next.set(key, value);
    if (key !== 'page') next.delete('page');
    router.replace(`${pathname}${next.size ? `?${next}` : ''}`, { scroll: false });
  }
  useEffect(() => {
    if ((params.get('q') ?? '') !== q) setParam('q', q || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const filtered = !!(
    q ||
    query.view !== 'all' ||
    query.channel !== 'all' ||
    query.range !== 'all' ||
    query.customerId
  );

  return (
    <>
      <PageHeader
        title="Orders"
        description="Website and WhatsApp orders in one list. Only verified payments count as paid."
      />

      <div className="mb-4 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex w-max gap-1.5">
          {VIEWS.map((v) => (
            <button
              key={v.value}
              type="button"
              onClick={() => setParam('view', v.value)}
              aria-pressed={query.view === v.value}
              className={cn(
                'flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors',
                query.view === v.value
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-surface text-muted-foreground hover:text-foreground',
              )}
            >
              {v.value === 'attention' && <CircleAlert className="size-3.5" />}
              {v.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-5 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Order number, name or phone"
            className="pl-10"
            aria-label="Search orders"
          />
        </div>
        <div className="flex gap-2">
          <Select
            size="md"
            aria-label="Channel"
            className="w-36"
            value={query.channel ?? 'all'}
            onValueChange={(v) => setParam('channel', v)}
            options={[
              { value: 'all', label: 'All channels' },
              { value: 'WEBSITE', label: 'Website' },
              { value: 'WHATSAPP', label: 'WhatsApp' },
            ]}
          />
          <SegmentedControl
            aria-label="Date range"
            value={query.range ?? 'all'}
            onValueChange={(v) => setParam('range', v)}
            options={[
              { value: 'today', label: 'Today' },
              { value: '7d', label: '7d' },
              { value: '30d', label: '30d' },
              { value: 'all', label: 'All' },
            ]}
          />
        </div>
      </div>

      <Card
        className={cn(
          'overflow-hidden transition-opacity',
          isFetching && !isPending && 'opacity-70',
        )}
      >
        {isPending ? (
          <div className="grid gap-3 p-5">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : !data?.items.length ? (
          filtered ? (
            <EmptyState
              icon={SearchX}
              tone="neutral"
              title="No orders match"
              description="Try another filter or search."
            />
          ) : (
            <EmptyState
              icon={Receipt}
              title="No orders yet"
              description="Website and WhatsApp orders will appear here as soon as customers check out."
            />
          )
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Order</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Placed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((o) => (
                    <TableRow
                      key={o.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/admin/orders/${o.ref}`)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <ChannelIcon channel={o.channel} />
                          <Link
                            href={`/admin/orders/${o.ref}`}
                            className="font-mono font-medium hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {o.ref}
                          </Link>
                          {o.needsAttention && (
                            <CircleAlert
                              className="size-4 text-danger"
                              aria-label="Needs attention"
                            />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{o.customer.name}</p>
                        <p className="text-xs text-muted-foreground">{o.customer.phone}</p>
                      </TableCell>
                      <TableCell>
                        <OrderStateBadge
                          status={o.status}
                          paymentStatus={o.paymentStatus}
                          fulfilmentStatus={o.fulfilmentStatus}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <p className="font-medium tabular">
                          <Money minor={o.totalMinor} currency={o.currency} />
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {o.itemCount} {o.itemCount === 1 ? 'item' : 'items'} ·{' '}
                          {o.fulfilmentMethod === 'DELIVERY' ? 'Delivery' : 'Collection'}
                        </p>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {timeAgo(o.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ul className="divide-y divide-border md:hidden">
              {data.items.map((o) => (
                <li key={o.id}>
                  <Link
                    href={`/admin/orders/${o.ref}`}
                    className="flex items-start gap-3 px-4 py-3.5 active:bg-muted"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm">
                        <span className="font-mono font-semibold">{o.ref}</span>
                        <ChannelIcon channel={o.channel} />
                        {o.needsAttention && (
                          <CircleAlert
                            className="size-4 text-danger"
                            aria-label="Needs attention"
                          />
                        )}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {o.customer.name} · {timeAgo(o.createdAt)}
                      </p>
                      <div className="mt-1.5">
                        <OrderStateBadge
                          status={o.status}
                          paymentStatus={o.paymentStatus}
                          fulfilmentStatus={o.fulfilmentStatus}
                        />
                      </div>
                    </div>
                    <p className="text-sm font-semibold tabular">
                      <Money minor={o.totalMinor} currency={o.currency} />
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
      {data && (
        <Pagination
          className="mt-5"
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          noun="orders"
          onPageChange={(p) => setParam('page', String(p))}
        />
      )}
    </>
  );
}
