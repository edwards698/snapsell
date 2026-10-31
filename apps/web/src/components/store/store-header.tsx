'use client';

import { cn, Logo } from '@snapsell/ui';
import { Search, ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useCart } from './cart';

function CartButton() {
  const { count, setOpen } = useCart();
  const [bump, setBump] = useState(false);
  const prev = useRef(count);
  useEffect(() => {
    if (count > prev.current) {
      setBump(true);
      const t = setTimeout(() => setBump(false), 300);
      prev.current = count;
      return () => clearTimeout(t);
    }
    prev.current = count;
  }, [count]);

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="relative flex size-11 items-center justify-center rounded-full transition-colors hover:bg-muted"
      aria-label={`Cart, ${count} item${count === 1 ? '' : 's'}`}
    >
      <ShoppingBag className="size-5" />
      {count > 0 && (
        <span
          className={cn(
            'absolute right-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground tabular',
            bump && 'animate-bump',
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

export function StoreHeader({ shopName }: { shopName: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="rounded-lg" aria-label={`${shopName} home`}>
          <Logo name={shopName} />
        </Link>
        <form action="/" role="search" className="relative ml-auto hidden w-full max-w-xs sm:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            name="q"
            type="search"
            placeholder="Search products"
            aria-label="Search products"
            className="h-10 w-full rounded-full border border-border bg-surface pl-9 pr-4 text-sm outline-none transition-shadow focus:border-ring focus:ring-4 focus:ring-ring/15"
          />
        </form>
        <div className="ml-auto flex items-center gap-1 sm:ml-2">
          <Link
            href="/?search=1"
            className="flex size-11 items-center justify-center rounded-full hover:bg-muted sm:hidden"
            aria-label="Search"
          >
            <Search className="size-5" />
          </Link>
          <CartButton />
        </div>
      </div>
    </header>
  );
}
