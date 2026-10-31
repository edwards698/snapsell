'use client';

import {
  Button,
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
import { useEffect, useState } from 'react';
import { useCart } from './cart';

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
  const { count, setOpen } = useCart();
  if (count === 0) {
    return (
      <EmptyState
        icon={ShoppingBag}
        title="Your cart is empty"
        description="Products you add will appear here."
        action={
          <Button variant="outline" onClick={() => setOpen(false)}>
            Continue shopping
          </Button>
        }
      />
    );
  }
  return (
    <p className="px-5 py-8 text-sm text-muted-foreground">Checkout opens in the next release.</p>
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
          <div className={cn('flex-1 overflow-y-auto')}>
            <CartBody />
          </div>
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Your cart</DrawerTitle>
          <DrawerDescription className="sr-only">Items in your cart</DrawerDescription>
        </DrawerHeader>
        <CartBody />
      </DrawerContent>
    </Drawer>
  );
}
