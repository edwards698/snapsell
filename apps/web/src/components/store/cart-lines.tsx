'use client';

import type { PricedLine } from '@snapsell/shared';
import { cn, Money, QuantityInput } from '@snapsell/ui';
import { Trash2 } from 'lucide-react';
import Link from 'next/link';
import { ProductImage } from '@/components/catalog/product-image';
import { useCart } from './cart';

export function CartLines({
  lines,
  currency,
  compact,
}: {
  lines: PricedLine[];
  currency: string;
  compact?: boolean;
}) {
  const cart = useCart();
  return (
    <ul className="divide-y divide-border">
      {lines.map((l) => (
        <li
          key={l.variantId}
          className={cn('flex gap-3 py-4', l.status === 'unavailable' && 'opacity-60')}
        >
          <Link
            href={`/products/${l.productSlug}`}
            onClick={() => cart.setOpen(false)}
            className="shrink-0"
          >
            <ProductImage
              image={l.image}
              sizes="80px"
              className="size-20 rounded-xl"
              alt={l.productName}
            />
          </Link>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{l.productName}</p>
                {l.variantLabel !== 'Default' && (
                  <p className="text-xs text-muted-foreground">{l.variantLabel}</p>
                )}
              </div>
              <p className="text-sm font-semibold">
                <Money
                  minor={
                    l.status === 'unavailable' ? l.unitPriceMinor * l.quantity : l.lineTotalMinor
                  }
                  currency={currency}
                  trimZeros
                />
              </p>
            </div>
            {l.status === 'unavailable' ? (
              <p className="text-xs font-medium text-danger">Sold out – remove to continue</p>
            ) : l.status === 'reduced' ? (
              <p className="text-xs font-medium text-warning-soft-foreground">
                Only {l.maxQuantity} available – quantity updated
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                <Money minor={l.unitPriceMinor} currency={currency} trimZeros /> each
              </p>
            )}
            {!compact && (
              <div className="mt-auto flex items-center justify-between pt-1">
                {l.status === 'unavailable' ? (
                  <span />
                ) : (
                  <QuantityInput
                    size="sm"
                    className="w-28"
                    value={l.quantity}
                    min={1}
                    max={Math.max(1, l.maxQuantity)}
                    onValueChange={(n) => cart.setQuantity(l.variantId, n)}
                    aria-label={`Quantity of ${l.productName}`}
                  />
                )}
                <button
                  type="button"
                  onClick={() => cart.remove(l.variantId)}
                  className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={`Remove ${l.productName}`}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
