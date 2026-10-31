'use client';

import type { StoreProduct, StoreVariant } from '@snapsell/shared';
import { Button, cn, Money, QuantityInput, toast } from '@snapsell/ui';
import { Check, ShoppingBag } from 'lucide-react';
import { useState } from 'react';
import { ProductImage } from '@/components/catalog/product-image';
import { useCart } from '@/components/store/cart';
import { AvailabilityBadge } from '@/components/store/product-card';

function Gallery({ product }: { product: StoreProduct }) {
  const [index, setIndex] = useState(0);
  const images = product.images;
  if (images.length === 0)
    return <ProductImage image={null} sizes="100vw" className="aspect-[4/5] w-full rounded-3xl" />;
  return (
    <div className="grid gap-3 lg:sticky lg:top-24">
      {/* Swipeable on phones (scroll snap), thumbnails on larger screens. */}
      <div
        className="-mx-4 flex snap-x snap-mandatory overflow-x-auto sm:mx-0 sm:rounded-3xl [&::-webkit-scrollbar]:hidden"
        onScroll={(e) =>
          setIndex(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))
        }
        id="gallery"
      >
        {images.map((img, i) => (
          <ProductImage
            key={img.id}
            image={img}
            alt={img.alt || product.name}
            priority={i === 0}
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="aspect-[4/5] w-full shrink-0 snap-center"
          />
        ))}
      </div>
      {images.length > 1 && (
        <>
          <div className="flex justify-center gap-1.5 sm:hidden" aria-hidden>
            {images.map((img, i) => (
              <span
                key={img.id}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  i === index ? 'w-5 bg-foreground' : 'w-1.5 bg-border-strong',
                )}
              />
            ))}
          </div>
          <div className="hidden gap-2 sm:flex">
            {images.map((img, i) => (
              <button
                key={img.id}
                type="button"
                onClick={() => {
                  const el = document.getElementById('gallery')!;
                  el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
                }}
                className={cn(
                  'overflow-hidden rounded-xl ring-2 ring-offset-2 ring-offset-background transition',
                  i === index ? 'ring-foreground' : 'ring-transparent opacity-70 hover:opacity-100',
                )}
                aria-label={`Show photo ${i + 1}`}
              >
                <ProductImage image={img} sizes="72px" className="size-18" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function OptionPicker({
  product,
  selected,
  onSelect,
}: {
  product: StoreProduct;
  selected: StoreVariant;
  onSelect: (v: StoreVariant) => void;
}) {
  return (
    <div className="grid gap-5">
      {product.optionNames.map((name) => {
        const values = [...new Set(product.variants.map((v) => v.optionValues[name]!))];
        return (
          <fieldset key={name}>
            <legend className="mb-2 text-sm font-medium">
              {name}:{' '}
              <span className="font-normal text-muted-foreground">
                {selected.optionValues[name]}
              </span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {values.map((value) => {
                // Prefer the variant that keeps the other selected options.
                const match =
                  product.variants.find(
                    (v) =>
                      v.optionValues[name] === value &&
                      product.optionNames.every(
                        (n) => n === name || v.optionValues[n] === selected.optionValues[n],
                      ),
                  ) ?? product.variants.find((v) => v.optionValues[name] === value)!;
                const soldOut = match.availability.state === 'sold_out';
                const active = selected.optionValues[name] === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onSelect(match)}
                    aria-pressed={active}
                    className={cn(
                      'min-w-12 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors',
                      active
                        ? 'border-foreground bg-foreground text-background'
                        : 'border-border-strong bg-surface hover:border-foreground',
                      soldOut && !active && 'text-muted-foreground line-through decoration-1',
                    )}
                  >
                    {value}
                  </button>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}

export function ProductView({ product }: { product: StoreProduct }) {
  const cart = useCart();
  const firstAvailable = product.variants.find((v) => v.maxQuantity > 0) ?? product.variants[0]!;
  const [variant, setVariant] = useState(firstAvailable);
  const [quantity, setQuantity] = useState(1);
  const inCart = cart.lines.find((l) => l.variantId === variant.id)?.quantity ?? 0;
  const max = Math.max(0, variant.maxQuantity - inCart);
  const canAdd = product.orderable && max > 0;
  const onSale = variant.compareAtMinor !== null && variant.compareAtMinor > variant.priceMinor;

  function add() {
    cart.add(variant.id, Math.min(quantity, max));
    setQuantity(1);
    toast.success('Added to cart', {
      description: `${product.name}${variant.label !== 'Default' ? ` · ${variant.label}` : ''}`,
      action: { label: 'View cart', onClick: () => cart.setOpen(true) },
    });
  }

  const addButton = (
    <Button size="lg" className="flex-1" onClick={add} disabled={!canAdd}>
      {canAdd ? (
        <>
          <ShoppingBag /> Add to cart
        </>
      ) : !product.orderable ? (
        'Currently unavailable'
      ) : inCart > 0 && variant.maxQuantity > 0 ? (
        <>
          <Check /> All available are in your cart
        </>
      ) : (
        'Sold out'
      )}
    </Button>
  );

  return (
    <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
      <Gallery product={product} />
      <div className="grid content-start gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            {product.name}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="text-2xl font-semibold">
              <Money minor={variant.priceMinor} currency={product.currency} trimZeros />
            </span>
            {onSale && (
              <span className="text-lg text-muted-foreground line-through">
                <Money minor={variant.compareAtMinor!} currency={product.currency} trimZeros />
              </span>
            )}
            <AvailabilityBadge
              availability={product.orderable ? variant.availability : { state: 'sold_out' }}
            />
          </div>
        </div>

        {product.optionNames.length > 0 && (
          <OptionPicker
            product={product}
            selected={variant}
            onSelect={(v) => (setVariant(v), setQuantity(1))}
          />
        )}

        {/* Desktop add-to-cart; phones get a sticky bar in the thumb zone (BUILD_PLAN §2.4). */}
        <div className="hidden gap-3 lg:flex">
          {canAdd && (
            <QuantityInput
              value={quantity}
              onValueChange={setQuantity}
              min={1}
              max={max}
              className="w-36"
              aria-label="Quantity"
            />
          )}
          {addButton}
        </div>

        {product.description && (
          <div className="border-t border-border pt-6">
            <h2 className="mb-2 text-sm font-semibold">About this product</h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {product.description}
            </p>
          </div>
        )}
        <div className="grid gap-2 rounded-2xl bg-muted/60 p-4 text-sm text-muted-foreground">
          <p>✓ No account needed – just your name and phone number.</p>
          <p>✓ Delivery or collection, chosen at checkout.</p>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 flex gap-3 border-t border-border bg-surface/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-lg lg:hidden">
        {canAdd && (
          <QuantityInput
            value={quantity}
            onValueChange={setQuantity}
            min={1}
            max={max}
            className="w-32"
            aria-label="Quantity"
          />
        )}
        {addButton}
      </div>
    </div>
  );
}
