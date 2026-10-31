'use client';

import { Avatar, Card, EmptyState, Input, Money, Pagination, Skeleton } from '@snapsell/ui';
import { Search, Users } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { timeAgo } from '@/components/orders/badges';
import { useDebounced } from '@/lib/catalog';
import { useCustomers } from '@/lib/orders';

export function CustomersPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounced(search);
  const { data, isPending } = useCustomers({ q: q || undefined, page });

  return (
    <>
      <PageHeader
        title="Customers"
        description="Everyone who has ordered, matched by phone number across the website and WhatsApp."
      />
      <div className="relative mb-5">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={search}
          onChange={(e) => (setSearch(e.target.value), setPage(1))}
          placeholder="Name or phone"
          className="pl-10"
          aria-label="Search customers"
        />
      </div>
      <Card className="overflow-hidden">
        {isPending ? (
          <div className="grid gap-3 p-5">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : !data?.items.length ? (
          <EmptyState
            icon={Users}
            title={q ? 'No customers match' : 'No customers yet'}
            description={
              q ? 'Try another name or number.' : 'Customers appear here after their first order.'
            }
            tone={q ? 'neutral' : 'primary'}
          />
        ) : (
          <ul className="divide-y divide-border">
            {data.items.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/admin/orders?customer=${c.id}`}
                  className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/50 sm:px-5"
                >
                  <Avatar name={c.name} className="size-10" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.phone}</p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-medium">
                      <Money minor={c.paidTotalMinor} currency={c.currency} />
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.orderCount} {c.orderCount === 1 ? 'order' : 'orders'}
                      {c.lastOrderAt && ` · ${timeAgo(c.lastOrderAt)}`}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {data && (
        <Pagination
          className="mt-5"
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          noun="customers"
          onPageChange={setPage}
        />
      )}
    </>
  );
}
