'use client';

import type { ProductListItem, ProductListQuery } from '@snapsell/shared';
import {
  Badge,
  Button,
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
import {
  Camera,
  ChevronRight,
  LayoutGrid,
  List,
  Package,
  Plus,
  Search,
  SearchX,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ProductImage } from '@/components/catalog/product-image';
import { QuickStock } from '@/components/catalog/quick-stock';
import { ProductStatusBadge, StockBadge } from '@/components/catalog/stock-badge';
import { PageHeader } from '@/components/admin/page-header';
import { useCategories, useDebounced, useProducts } from '@/lib/catalog';

const VIEW_KEY = 'snapsell:products-view';

function Price({ p }: { p: ProductListItem }) {
  return (
    <span className="tabular">
      <Money minor={p.priceMinMinor} currency={p.currency} trimZeros />
      {p.priceMaxMinor !== p.priceMinMinor && (
        <>
          {' – '}
          <Money minor={p.priceMaxMinor} currency={p.currency} trimZeros />
        </>
      )}
    </span>
  );
}

function StockCell({ p }: { p: ProductListItem }) {
  if (p.singleVariantId) {
    return (
      <QuickStock
        variantId={p.singleVariantId}
        name={p.name}
        onHand={p.onHand}
        available={p.available}
        state={p.state}
      />
    );
  }
  // Several variants: the total can be healthy while one size is low, so say so explicitly.
  if (p.state === 'low') {
    return (
      <Badge tone="warning" dot>
        {p.available} in stock · some low
      </Badge>
    );
  }
  return <StockBadge state={p.state} available={p.available} />;
}

function ProductCard({ p }: { p: ProductListItem }) {
  return (
    <Card className="group relative overflow-hidden transition-shadow hover:shadow-md">
      <Link
        href={`/admin/products/${p.id}`}
        className="absolute inset-0 z-10 rounded-2xl"
        aria-label={`Edit ${p.name}`}
      />
      <div className="relative">
        <ProductImage
          image={p.image}
          sizes="(min-width: 1024px) 25vw, 50vw"
          className="aspect-[4/5] w-full transition-transform duration-300 group-hover:scale-[1.02]"
        />
        {p.status !== 'ACTIVE' && (
          <ProductStatusBadge status={p.status} className="absolute left-2.5 top-2.5 shadow-sm" />
        )}
      </div>
      <div className="grid gap-1.5 p-3.5 sm:p-4">
        <p className="truncate text-sm font-medium">{p.name}</p>
        <p className="flex items-center gap-2 text-sm">
          <Price p={p} />
          {p.compareAtMinor && p.compareAtMinor > p.priceMaxMinor && (
            <span className="text-xs text-muted-foreground line-through">
              <Money minor={p.compareAtMinor} currency={p.currency} trimZeros />
            </span>
          )}
        </p>
        <div className="relative z-20 mt-1 flex w-fit flex-wrap items-center gap-1.5">
          <StockCell p={p} />
          {p.variantCount > 1 && (
            <Badge tone="outline" size="sm">
              {p.variantCount} variants
            </Badge>
          )}
        </div>
      </div>
    </Card>
  );
}

function ProductTable({ items }: { items: ProductListItem[] }) {
  const router = useRouter();
  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[45%]">Product</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Stock</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((p) => (
            <TableRow
              key={p.id}
              className="cursor-pointer"
              onClick={() => router.push(`/admin/products/${p.id}`)}
            >
              <TableCell>
                <div className="flex items-center gap-3">
                  <ProductImage
                    image={p.image}
                    sizes="48px"
                    className="size-12 shrink-0 rounded-lg"
                  />
                  <div className="min-w-0">
                    <Link
                      href={`/admin/products/${p.id}`}
                      className="block truncate font-medium hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {p.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {p.variantCount === 1 ? '1 variant' : `${p.variantCount} variants`}
                    </p>
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">{p.category?.name ?? '—'}</TableCell>
              <TableCell>
                <Price p={p} />
              </TableCell>
              <TableCell>
                <StockCell p={p} />
              </TableCell>
              <TableCell>
                <ProductStatusBadge status={p.status} />
              </TableCell>
              <TableCell>
                <ChevronRight className="size-4 text-muted-foreground" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

export function ProductsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const debounced = useDebounced(search);
  const [view, setView] = useState<'grid' | 'table'>('grid');

  useEffect(() => {
    try {
      if (localStorage.getItem(VIEW_KEY) === 'table') setView('table');
    } catch {
      // ignore
    }
  }, []);

  const query: ProductListQuery = {
    q: debounced || undefined,
    status: (params.get('status') as ProductListQuery['status']) ?? 'all',
    categoryId: params.get('category') ?? undefined,
    stock: (params.get('stock') as ProductListQuery['stock']) ?? 'all',
    sort: (params.get('sort') as ProductListQuery['sort']) ?? 'updated',
    page: Number(params.get('page') ?? 1),
    pageSize: 24,
  };

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (!value || value === 'all') next.delete(key);
    else next.set(key, value);
    if (key !== 'page') next.delete('page');
    router.replace(`${pathname}${next.size ? `?${next}` : ''}`, { scroll: false });
  }

  useEffect(() => {
    if ((params.get('q') ?? '') !== debounced) setParam('q', debounced || null);
    // Only react to the debounced search text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const { data, isPending, isFetching } = useProducts(query);
  const categories = useCategories();
  const filtered = !!(
    query.q ||
    query.status !== 'all' ||
    query.categoryId ||
    query.stock !== 'all'
  );

  function changeView(v: 'grid' | 'table') {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // ignore
    }
  }

  return (
    <>
      <PageHeader
        title="Products"
        description={
          data
            ? `${data.total} ${data.total === 1 ? 'product' : 'products'}${filtered ? ' match your filters' : ''}`
            : 'Your catalogue'
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/admin/products/new">
                <Plus /> Add product
              </Link>
            </Button>
            <Button asChild>
              <Link href="/admin/products/new?snap=1">
                <Camera /> Snap product
              </Link>
            </Button>
          </>
        }
      />

      <div className="mb-5 grid gap-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, SKU or category"
              className="pl-10"
              aria-label="Search products"
            />
          </div>
          <SegmentedControl
            aria-label="Layout"
            value={view}
            onValueChange={changeView}
            className="hidden md:inline-flex"
            options={[
              { value: 'grid', label: <span className="sr-only">Grid</span>, icon: <LayoutGrid /> },
              { value: 'table', label: <span className="sr-only">Table</span>, icon: <List /> },
            ]}
          />
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          <SegmentedControl
            aria-label="Stock"
            size="sm"
            value={query.stock ?? 'all'}
            onValueChange={(v) => setParam('stock', v)}
            className="shrink-0"
            options={[
              { value: 'all', label: 'All' },
              { value: 'low', label: 'Low' },
              { value: 'out', label: 'Out' },
            ]}
          />
          <Select
            size="sm"
            aria-label="Category"
            className="w-44 shrink-0"
            value={query.categoryId ?? 'all'}
            onValueChange={(v) => setParam('category', v)}
            options={[
              { value: 'all', label: 'All categories' },
              ...(categories.data ?? [])
                .filter((c) => !c.archived)
                .map((c) => ({ value: c.id, label: c.name })),
              { value: 'none', label: 'No category' },
            ]}
          />
          <Select
            size="sm"
            aria-label="Status"
            className="w-36 shrink-0"
            value={query.status ?? 'all'}
            onValueChange={(v) => setParam('status', v)}
            options={[
              { value: 'all', label: 'All statuses' },
              { value: 'ACTIVE', label: 'Active' },
              { value: 'INACTIVE', label: 'Hidden' },
              { value: 'UNAVAILABLE', label: 'Unavailable' },
              { value: 'ARCHIVED', label: 'Archived' },
            ]}
          />
          <Select
            size="sm"
            aria-label="Sort"
            className="w-44 shrink-0"
            value={query.sort ?? 'updated'}
            onValueChange={(v) => setParam('sort', v)}
            options={[
              { value: 'updated', label: 'Recently updated' },
              { value: 'name', label: 'Name A–Z' },
              { value: 'price', label: 'Price, low to high' },
              { value: 'stock', label: 'Stock, lowest first' },
            ]}
          />
        </div>
      </div>

      <div className={cn('transition-opacity', isFetching && !isPending && 'opacity-60')}>
        {isPending ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="aspect-[4/6] rounded-2xl" />
            ))}
          </div>
        ) : !data?.items.length ? (
          <Card>
            {filtered ? (
              <EmptyState
                icon={SearchX}
                tone="neutral"
                title="No products match"
                description="Try a different search or clear the filters."
                action={
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearch('');
                      router.replace(pathname);
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={Package}
                title="Add your first product"
                description="Snap a photo and record a quick voice note. The assistant fills in the details for you to check."
                action={
                  <>
                    <Button asChild size="lg">
                      <Link href="/admin/products/new?snap=1">
                        <Camera /> Snap your first product
                      </Link>
                    </Button>
                    <Button asChild size="lg" variant="outline">
                      <Link href="/admin/products/new">Add manually</Link>
                    </Button>
                  </>
                }
              />
            )}
          </Card>
        ) : view === 'table' ? (
          <>
            <div className="hidden md:block">
              <ProductTable items={data.items} />
            </div>
            <div className="grid grid-cols-2 gap-3 md:hidden">
              {data.items.map((p) => (
                <ProductCard key={p.id} p={p} />
              ))}
            </div>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {data.items.map((p) => (
              <ProductCard key={p.id} p={p} />
            ))}
          </div>
        )}
      </div>

      {data && (
        <Pagination
          className="mt-6"
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          noun="products"
          onPageChange={(p) => setParam('page', String(p))}
        />
      )}
    </>
  );
}
