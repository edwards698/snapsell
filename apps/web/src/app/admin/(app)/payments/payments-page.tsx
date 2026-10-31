'use client';

import {
  Badge,
  Card,
  EmptyState,
  Money,
  Pagination,
  SegmentedControl,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@snapsell/ui';
import { CreditCard, Webhook } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { timeAgo } from '@/components/orders/badges';
import { usePayments, useWebhookEvents } from '@/lib/orders';

const TONE: Record<string, 'success' | 'danger' | 'info' | 'neutral' | 'warning'> = {
  PAID: 'success',
  FAILED: 'danger',
  LINK_CREATED: 'info',
  PROCESSED: 'success',
  IGNORED: 'warning',
  RECEIVED: 'info',
};

function PaymentsTable() {
  const [page, setPage] = useState(1);
  const { data, isPending } = usePayments(page);
  if (isPending) return <Skeleton className="h-64 rounded-2xl" />;
  if (!data?.items.length)
    return (
      <Card>
        <EmptyState
          icon={CreditCard}
          title="No payments yet"
          description="Payment links appear here as soon as customers check out."
        />
      </Card>
    );
  return (
    <>
      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Order</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="hidden sm:table-cell">DevDraft link</TableHead>
              <TableHead className="text-right">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <Link
                    href={`/admin/orders/${p.orderRef}`}
                    className="font-mono font-medium hover:underline"
                  >
                    {p.orderRef}
                  </Link>
                  {p.error && (
                    <p className="max-w-xs truncate text-xs text-danger" title={p.error}>
                      {p.error}
                    </p>
                  )}
                </TableCell>
                <TableCell>
                  <Badge tone={TONE[p.status] ?? 'neutral'}>
                    {p.status === 'LINK_CREATED' ? 'Link sent' : p.status.toLowerCase()}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-medium">
                  <Money minor={p.amountMinor} currency={p.currency} />
                </TableCell>
                <TableCell className="hidden font-mono text-xs text-muted-foreground sm:table-cell">
                  {p.providerLinkId?.slice(0, 13) ?? '—'}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {timeAgo(p.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <Pagination
        className="mt-4"
        page={data.page}
        pageSize={data.pageSize}
        total={data.total}
        noun="payments"
        onPageChange={setPage}
      />
    </>
  );
}

function WebhooksTable() {
  const [page, setPage] = useState(1);
  const { data, isPending } = useWebhookEvents(page);
  if (isPending) return <Skeleton className="h-64 rounded-2xl" />;
  if (!data?.items.length)
    return (
      <Card>
        <EmptyState
          icon={Webhook}
          tone="neutral"
          title="No notifications yet"
          description="DevDraft’s payment notifications (webhooks) are listed here with what SnapSell did with each."
        />
      </Card>
    );
  return (
    <>
      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Event</TableHead>
              <TableHead>Result</TableHead>
              <TableHead className="text-right">Received</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((w) => (
              <TableRow key={w.id}>
                <TableCell>
                  <p className="font-mono text-xs font-medium">{w.type}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {w.providerEventId.slice(0, 24)}
                  </p>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={w.signatureValid ? (TONE[w.status] ?? 'neutral') : 'danger'}>
                      {w.signatureValid ? w.status.toLowerCase() : 'bad signature'}
                    </Badge>
                    <span className="text-sm text-muted-foreground">{w.outcome}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {timeAgo(w.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <Pagination
        className="mt-4"
        page={data.page}
        pageSize={data.pageSize}
        total={data.total}
        noun="events"
        onPageChange={setPage}
      />
    </>
  );
}

export function PaymentsPage() {
  const [tab, setTab] = useState<'payments' | 'webhooks'>('payments');
  return (
    <>
      <PageHeader
        title="Payments"
        description="Payment links sent through DevDraft, and every notification DevDraft sent back. An order is paid only after a verified notification."
      />
      <SegmentedControl
        aria-label="View"
        className="mb-5"
        value={tab}
        onValueChange={setTab}
        options={[
          { value: 'payments', label: 'Payment links' },
          { value: 'webhooks', label: 'Notifications' },
        ]}
      />
      {tab === 'payments' ? <PaymentsTable /> : <WebhooksTable />}
    </>
  );
}
