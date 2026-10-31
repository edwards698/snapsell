import { Badge, Card, cn } from '@snapsell/ui';
import { CreditCard, MessageCircle, Search, SearchX, ShoppingBag, Truck } from 'lucide-react';
import Link from 'next/link';
import { StoreProductCard } from '@/components/store/product-card';
import { getCategories, getProducts, getStoreInfo } from '@/lib/store';

const FEATURES = [
  {
    icon: ShoppingBag,
    title: 'Shop without an account',
    text: 'Just your name and phone number at checkout.',
  },
  {
    icon: MessageCircle,
    title: 'Order on WhatsApp',
    text: 'Send a message, a photo or a voice note.',
  },
  {
    icon: CreditCard,
    title: 'Secure payment links',
    text: 'Pay safely; we confirm as soon as it clears.',
  },
  { icon: Truck, title: 'Delivery or collection', text: 'Choose what suits you at checkout.' },
];

const SORTS = [
  ['featured', 'Featured'],
  ['newest', 'Newest'],
  ['price-asc', 'Price ↑'],
  ['price-desc', 'Price ↓'],
] as const;

function OpeningSoon({ name }: { name: string }) {
  return (
    <>
      <section className="relative overflow-hidden border-b border-border">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(50% 60% at 15% 0%, var(--primary-soft), transparent 70%), radial-gradient(40% 50% at 95% 30%, var(--accent-soft), transparent 70%)',
          }}
        />
        <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <Badge tone="primary" dot pulse>
            Opening soon
          </Badge>
          <h1 className="mt-5 max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            {name} is getting ready for you.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-muted-foreground text-pretty">
            Our products are on their way to this page. Soon you’ll be able to browse, add to cart
            and pay securely in a few taps.
          </p>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16" aria-label="How it works">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <li key={f.title}>
              <Card className="h-full p-5">
                <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-foreground">
                  <f.icon className="size-5" />
                </span>
                <h2 className="mt-4 text-sm font-semibold">{f.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

export default async function StoreHome({ searchParams }: PageProps<'/'>) {
  const sp = await searchParams;
  const str = (v: string | string[] | undefined) => (typeof v === 'string' && v ? v : undefined);
  const q = str(sp.q);
  const category = str(sp.category);
  const sort = (str(sp.sort) ?? 'featured') as (typeof SORTS)[number][0];
  const page = Number(str(sp.page) ?? 1) || 1;

  const [store, categories, products] = await Promise.all([
    getStoreInfo(),
    getCategories(),
    getProducts({ q, category, sort, page }),
  ]);
  const filtered = !!(q || category);
  if (!products || (products.total === 0 && !filtered)) return <OpeningSoon name={store.name} />;

  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const next = { q, category, sort: sort === 'featured' ? undefined : sort, ...patch };
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    return p.size ? `/?${p}` : '/';
  };
  const activeCategory = categories.find((c) => c.slug === category);
  const pages = Math.ceil(products.total / products.pageSize);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
      {!filtered && (
        <section className="py-8 sm:py-12">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{store.name}</h1>
          <p className="mt-2 text-muted-foreground">
            Order online in a minute, or chat with us on WhatsApp.
          </p>
        </section>
      )}

      {filtered && (
        <section className="py-6 sm:py-8">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {q ? `Results for “${q}”` : (activeCategory?.name ?? 'Products')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {products.total} {products.total === 1 ? 'product' : 'products'}
          </p>
        </section>
      )}

      {sp.search === '1' && (
        <form action="/" role="search" className="relative mb-5 sm:hidden">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            name="q"
            type="search"
            autoFocus
            placeholder="Search products"
            aria-label="Search products"
            className="h-12 w-full rounded-full border border-border bg-surface pl-10 pr-4 text-base outline-none focus:border-ring focus:ring-4 focus:ring-ring/15"
          />
        </form>
      )}

      <nav
        aria-label="Categories"
        className="sticky top-16 z-20 -mx-4 mb-6 flex gap-2 overflow-x-auto bg-background/90 px-4 py-3 backdrop-blur-lg sm:mx-0 sm:px-0"
      >
        {[{ slug: undefined, name: 'All' }, ...categories].map((c) => {
          const active = c.slug === category;
          return (
            <Link
              key={c.slug ?? 'all'}
              href={href({ category: c.slug, q: undefined })}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors',
                active
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-surface hover:border-border-strong',
              )}
            >
              {c.name}
            </Link>
          );
        })}
        <div className="ml-auto hidden shrink-0 items-center gap-1 pl-4 sm:flex">
          {SORTS.map(([value, label]) => (
            <Link
              key={value}
              href={href({ sort: value === 'featured' ? undefined : value })}
              className={cn(
                'rounded-full px-3 py-2 text-sm',
                sort === value
                  ? 'bg-muted font-medium'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </Link>
          ))}
        </div>
      </nav>

      {products.items.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <SearchX className="size-6" />
          </span>
          <h2 className="mt-4 font-semibold">Nothing found</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Try another word, or browse all products.
          </p>
          <Link href="/" className="mt-5 text-sm font-medium text-primary hover:underline">
            See all products
          </Link>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-4">
          {products.items.map((p, i) => (
            <li key={p.id}>
              <StoreProductCard p={p} priority={i < 4} />
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav aria-label="Pages" className="mt-10 flex justify-center gap-2">
          {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
            <Link
              key={n}
              href={href({ page: n === 1 ? undefined : String(n) })}
              aria-current={n === page ? 'page' : undefined}
              className={cn(
                'flex size-10 items-center justify-center rounded-full text-sm',
                n === page ? 'bg-foreground text-background' : 'hover:bg-muted',
              )}
            >
              {n}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
