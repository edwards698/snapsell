'use client';

import type { StockMovementDto, StockRow } from '@snapsell/shared';
import {
  Badge,
  Button,
  Card,
  cn,
  EmptyState,
  Field,
  Input,
  Pagination,
  QuantityInput,
  SegmentedControl,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  Skeleton,
  toast,
} from '@snapsell/ui';
import { Boxes, CircleAlert, History, PackageCheck, PackageX, Search, SearchX } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { AdjustStockDialog, type AdjustTarget } from '@/components/catalog/adjust-stock-dialog';
import { ProductImage } from '@/components/catalog/product-image';
import { StockBadge } from '@/components/catalog/stock-badge';
import {
  useDebounced,
  useMovements,
  useSetThreshold,
  useStock,
  useStockSummary,
} from '@/lib/catalog';

const target = (r: StockRow): AdjustTarget => ({
  variantId: r.variantId,
  title: r.productName,
  subtitle: r.label === 'Default' ? undefined : r.label,
  onHand: r.onHand,
  reserved: r.reserved,
});

function SummaryTile({
  icon: Icon,
  label,
  value,
  tone,
  active,
  onClick,
}: {
  icon: typeof Boxes;
  label: string;
  value: number | undefined;
  tone: 'neutral' | 'warning' | 'danger';
  active: boolean;
  onClick: () => void;
}) {
  const toneClass = {
    neutral: 'bg-muted text-muted-foreground',
    warning: 'bg-warning-soft text-warning-soft-foreground',
    danger: 'bg-danger-soft text-danger-soft-foreground',
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex items-center gap-3 rounded-2xl border bg-surface p-4 text-left shadow-xs transition-all hover:shadow-sm',
        active ? 'border-primary ring-4 ring-primary/10' : 'border-border',
      )}
    >
      <span
        className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', toneClass)}
      >
        <Icon className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-medium text-muted-foreground sm:text-sm">{label}</span>
        <span className="block text-xl font-semibold tabular">{value ?? '—'}</span>
      </span>
    </button>
  );
}

const REASON_LABEL: Record<string, string> = {
  MANUAL_ADJUST: 'Adjustment',
  RESERVE: 'Reserved for order',
  RELEASE: 'Reservation released',
  SALE: 'Sold',
  RETURN: 'Return',
  CORRECTION: 'Count correction',
};

function Movement({ m }: { m: StockMovementDto }) {
  const delta = m.deltaOnHand || m.deltaReserved;
  const reservedOnly = m.deltaOnHand === 0 && m.deltaReserved !== 0;
  return (
    <li className="flex gap-3 py-3">
      <span
        className={cn(
          'mt-0.5 flex h-7 min-w-11 items-center justify-center rounded-lg px-2 text-xs font-semibold tabular',
          reservedOnly
            ? 'bg-info-soft text-info-soft-foreground'
            : delta > 0
              ? 'bg-success-soft text-success-soft-foreground'
              : 'bg-danger-soft text-danger-soft-foreground',
        )}
      >
        {delta > 0 ? '+' : ''}
        {delta}
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium">
          {m.note ?? REASON_LABEL[m.reason] ?? m.reason}
          {m.orderRef && <span className="font-normal text-muted-foreground"> · {m.orderRef}</span>}
        </p>
        <p className="text-xs text-muted-foreground">
          {reservedOnly ? 'Reserved, not yet sold · ' : ''}
          {new Date(m.createdAt).toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}
          {m.userName && ` · ${m.userName}`}
        </p>
      </div>
    </li>
  );
}

function VariantSheet({
  row,
  onClose,
  onAdjust,
}: {
  row: StockRow | null;
  onClose: () => void;
  onAdjust: (r: StockRow) => void;
}) {
  const history = useMovements(row?.variantId ?? null);
  const setThreshold = useSetThreshold();
  const [threshold, setThresholdValue] = useState(row?.lowStockThreshold ?? 3);
  useEffect(
    () => setThresholdValue(row?.lowStockThreshold ?? 3),
    [row?.variantId, row?.lowStockThreshold],
  );

  return (
    <Sheet open={!!row} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="max-w-md">
        {row && (
          <>
            <div className="flex gap-3 border-b border-border p-5 pr-14">
              <ProductImage
                image={row.image}
                sizes="56px"
                className="size-14 shrink-0 rounded-xl"
              />
              <div className="min-w-0">
                <SheetTitle className="truncate text-base font-semibold">
                  {row.productName}
                </SheetTitle>
                <SheetDescription className="text-sm text-muted-foreground">
                  {row.label === 'Default' ? row.sku : `${row.label} · ${row.sku}`}
                </SheetDescription>
                <StockBadge state={row.state} available={row.available} className="mt-2" />
              </div>
            </div>
            <div className="grid grid-cols-3 divide-x divide-border border-b border-border text-center">
              {[
                ['On hand', row.onHand],
                ['Reserved', row.reserved],
                ['Available', row.available],
              ].map(([label, n]) => (
                <div key={label} className="py-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-lg font-semibold tabular">{n}</p>
                </div>
              ))}
            </div>
            <div className="grid gap-4 border-b border-border p-5">
              <Button onClick={() => onAdjust(row)}>Adjust stock</Button>
              <Field
                label="Low-stock alert at"
                hint="You’ll see a warning when available stock drops to this."
              >
                <div className="flex gap-2">
                  <QuantityInput
                    value={threshold}
                    onValueChange={setThresholdValue}
                    size="sm"
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9"
                    disabled={threshold === row.lowStockThreshold}
                    loading={setThreshold.isPending}
                    onClick={() =>
                      setThreshold.mutate(
                        { variantId: row.variantId, lowStockThreshold: threshold },
                        { onSuccess: () => toast.success('Alert level saved') },
                      )
                    }
                  >
                    Save
                  </Button>
                </div>
              </Field>
              <Button variant="link" asChild className="justify-self-start">
                <Link href={`/admin/products/${row.productId}`}>Edit product</Link>
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 pb-6">
              <p className="flex items-center gap-2 pt-4 text-sm font-semibold">
                <History className="size-4 text-muted-foreground" /> History
              </p>
              {history.isPending ? (
                <div className="grid gap-3 pt-3">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-10" />
                  ))}
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {history.data?.items.map((m) => (
                    <Movement key={m.id} m={m} />
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function StockPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const q = useDebounced(search);
  const filter = (params.get('stock') ?? 'all') as 'all' | 'low' | 'out';
  const page = Number(params.get('page') ?? 1);
  const { data, isPending, isFetching } = useStock({ q: q || undefined, stock: filter, page });
  const summary = useStockSummary();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState<AdjustTarget | null>(null);
  const selected = data?.items.find((r) => r.variantId === selectedId) ?? null;

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

  return (
    <>
      <PageHeader
        title="Stock"
        description="Stock is reserved when an order is confirmed and taken off when payment is verified."
      />

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryTile
          icon={PackageCheck}
          label="Units available"
          value={summary.data?.unitsAvailable}
          tone="neutral"
          active={filter === 'all'}
          onClick={() => setParam('stock', null)}
        />
        <SummaryTile
          icon={CircleAlert}
          label="Running low"
          value={summary.data?.low}
          tone="warning"
          active={filter === 'low'}
          onClick={() => setParam('stock', 'low')}
        />
        <SummaryTile
          icon={PackageX}
          label="Out of stock"
          value={summary.data?.out}
          tone="danger"
          active={filter === 'out'}
          onClick={() => setParam('stock', 'out')}
        />
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products or SKUs"
            className="pl-10"
            aria-label="Search stock"
          />
        </div>
        <SegmentedControl
          aria-label="Stock filter"
          value={filter}
          onValueChange={(v) => setParam('stock', v)}
          options={[
            { value: 'all', label: 'All' },
            { value: 'low', label: 'Low' },
            { value: 'out', label: 'Out' },
          ]}
        />
      </div>

      <Card
        className={cn(
          'overflow-hidden transition-opacity',
          isFetching && !isPending && 'opacity-60',
        )}
      >
        {isPending ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 p-4">
                <Skeleton className="size-12 rounded-lg" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))}
          </div>
        ) : !data?.items.length ? (
          q || filter !== 'all' ? (
            <EmptyState
              icon={SearchX}
              tone="neutral"
              title={
                filter === 'out'
                  ? 'Nothing is out of stock'
                  : filter === 'low'
                    ? 'Nothing is running low'
                    : 'No matches'
              }
              description={
                filter === 'all' ? 'Try a different search.' : 'Nice work keeping the shelves full.'
              }
            />
          ) : (
            <EmptyState
              icon={Boxes}
              title="No stock to track yet"
              description="Add products and their stock levels will appear here."
              action={
                <Button asChild>
                  <Link href="/admin/products/new">Add a product</Link>
                </Button>
              }
            />
          )
        ) : (
          <ul className="divide-y divide-border">
            {data.items.map((r) => (
              <li
                key={r.variantId}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 sm:px-5"
              >
                <button
                  type="button"
                  onClick={() => setSelectedId(r.variantId)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <ProductImage
                    image={r.image}
                    sizes="48px"
                    className="size-12 shrink-0 rounded-lg"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {r.productName}
                      {r.label !== 'Default' && (
                        <span className="text-muted-foreground"> · {r.label}</span>
                      )}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <span className="font-mono">{r.sku}</span>
                      {r.productStatus !== 'ACTIVE' && (
                        <Badge size="sm" tone="outline">
                          {r.productStatus === 'INACTIVE' ? 'Hidden' : 'Unavailable'}
                        </Badge>
                      )}
                    </span>
                  </span>
                  <span className="hidden text-right text-xs text-muted-foreground tabular sm:block">
                    {r.onHand} on hand
                    {r.reserved > 0 && (
                      <>
                        <br />
                        {r.reserved} reserved
                      </>
                    )}
                  </span>
                  <StockBadge state={r.state} available={r.available} className="shrink-0" />
                </button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAdjusting(target(r))}
                  className="shrink-0"
                >
                  Adjust
                </Button>
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
          noun="variants"
          onPageChange={(p) => setParam('page', String(p))}
        />
      )}

      <VariantSheet
        row={selected}
        onClose={() => setSelectedId(null)}
        onAdjust={(r) => setAdjusting(target(r))}
      />
      <AdjustStockDialog target={adjusting} onOpenChange={(o) => !o && setAdjusting(null)} />
    </>
  );
}
