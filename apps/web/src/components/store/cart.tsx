'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/** The cart holds only variant IDs and quantities; prices always come from the server (BUILD_PLAN Phase 3). */
export interface CartLine {
  variantId: string;
  quantity: number;
}

interface CartValue {
  lines: CartLine[];
  count: number;
  open: boolean;
  setOpen: (open: boolean) => void;
  add: (variantId: string, quantity?: number) => void;
  setQuantity: (variantId: string, quantity: number) => void;
  remove: (variantId: string) => void;
}

const KEY = 'snapsell:cart';
const CartContext = createContext<CartValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
      if (Array.isArray(saved))
        setLines(saved.filter((l): l is CartLine => typeof l?.variantId === 'string'));
    } catch {
      // Unavailable or corrupt storage – start empty.
    }
  }, []);

  const persist = useCallback((next: CartLine[]) => {
    setLines(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo<CartValue>(
    () => ({
      lines,
      count: lines.reduce((n, l) => n + l.quantity, 0),
      open,
      setOpen,
      add: (variantId, quantity = 1) => {
        const existing = lines.find((l) => l.variantId === variantId);
        persist(
          existing
            ? lines.map((l) =>
                l.variantId === variantId ? { ...l, quantity: l.quantity + quantity } : l,
              )
            : [...lines, { variantId, quantity }],
        );
      },
      setQuantity: (variantId, quantity) =>
        persist(
          quantity <= 0
            ? lines.filter((l) => l.variantId !== variantId)
            : lines.map((l) => (l.variantId === variantId ? { ...l, quantity } : l)),
        ),
      remove: (variantId) => persist(lines.filter((l) => l.variantId !== variantId)),
    }),
    [lines, open, persist],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}
