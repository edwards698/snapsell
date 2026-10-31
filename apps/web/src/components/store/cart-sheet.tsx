'use client';

import {
  Button,
  Money,
  Skeleton,
  cn,
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  EmptyState,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@snapsell/ui';
import { ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useCart, usePricedCart } from './cart';
import { CartLines } from './cart-lines';

function useIsDesktop() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return desktop;
}

function CartBody() {
  const cart = useCart();
  const { priced, loading } = usePricedCart();
  // Quantities the server had to cap are written back to the cart.
  useEffect(() => {
    if (!priced) return;
    const reduced = priced.lines.filter((l) => l.status === 'reduced');
    if (reduced.length) reduced.forEach((l) => cart.setQuantity(l.variantId, l.maxQuantity));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priced]);

  if (cart.count === 0) {
    return (
      <EmptyState
        icon={ShoppingBag}
        title="Your cart is empty"
        description="Products you add will appear here."
        action={
          <Button variant="outline" onClick={() => cart.setOpen(false)}>
            Continue shopping
          </Button>
        }
      />
    );
  }
  if (!priced) {
    return (
      <div className="grid gap-4 p-5">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    );
  }
  const blocked = priced.lines.some((l) => l.status === 'unavailable');
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className={cn('flex-1 overflow-y-auto px-5 transition-opacity', loading && 'opacity-70')}
      >
        <CartLines lines={priced.lines} currency={priced.currency} />
      </div>
      <div className="grid gap-3 border-t border-border p-5">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">Subtotal</span>
          <span className="text-lg font-semibold">
            <Money minor={priced.subtotalMinor} currency={priced.currency} />
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Delivery or collection is chosen at checkout.
        </p>
        <Button asChild size="lg" disabled={blocked} onClick={() => cart.setOpen(false)}>
          <Link
            href="/checkout"
            aria-disabled={blocked}
            className={cn(blocked && 'pointer-events-none opacity-50')}
          >
            Checkout
          </Link>
        </Button>
      </div>
    </div>
  );
}

/** Bottom sheet on phones, side sheet on larger screens (BUILD_PLAN §2.4). */
export function CartSheet() {
  const { open, setOpen } = useCart();
  const desktop = useIsDesktop();

  if (desktop) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <div className="border-b border-border px-5 py-4">
            <SheetTitle className="text-lg font-semibold">Your cart</SheetTitle>
            <SheetDescription className="sr-only">Items in your cart</SheetDescription>
          </div>
          <CartBody />
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerContent className="h-[85dvh]">
        <DrawerHeader>
          <DrawerTitle>Your cart</DrawerTitle>
          <DrawerDescription className="sr-only">Items in your cart</DrawerDescription>
        </DrawerHeader>
        <CartBody />
      </DrawerContent>
    </Drawer>
  );
}
