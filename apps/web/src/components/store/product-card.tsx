import type { Availability, StoreProductCard as Card } from '@snapsell/shared';
import { Badge, cn, Money } from '@snapsell/ui';
import Link from 'next/link';
import { ProductImage } from '@/components/catalog/product-image';

export function AvailabilityBadge({
  availability,
  className,
}: {
  availability: Availability;
  className?: string;
}) {
  if (availability.state === 'sold_out')
    return (
      <Badge tone="neutral" className={className}>
        Sold out
      </Badge>
    );
  if (availability.state === 'low')
    return (
      <Badge tone="warning" dot className={className}>
        Only {availability.left} left
      </Badge>
    );
  return (
    <Badge tone="success" dot className={className}>
      In stock
    </Badge>
  );
}

export function StoreProductCard({ p, priority }: { p: Card; priority?: boolean }) {
  const onSale = p.compareAtMinor !== null && p.compareAtMinor > p.priceMaxMinor;
  return (
    <Link
      href={`/products/${p.slug}`}
      className="group block rounded-2xl focus-visible:outline-offset-4"
    >
      <div className="relative overflow-hidden rounded-2xl bg-muted">
        <ProductImage
          image={p.image}
          alt={p.name}
          priority={priority}
          sizes="(min-width: 1024px) 22vw, (min-width: 640px) 30vw, 46vw"
          className={cn(
            'aspect-[4/5] w-full transition-transform duration-500 group-hover:scale-[1.03]',
            !p.orderable && 'opacity-60 grayscale-[40%]',
          )}
        />
        <div className="absolute left-2.5 top-2.5 flex gap-1.5">
          {onSale && (
            <Badge tone="danger" size="sm" className="shadow-sm">
              Sale
            </Badge>
          )}
          {p.availability.state !== 'in_stock' && (
            <AvailabilityBadge
              availability={p.availability}
              className="h-5 px-2 text-[11px] shadow-sm"
            />
          )}
        </div>
      </div>
      <div className="mt-3 px-0.5">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug">{p.name}</h3>
        <p className="mt-1 flex items-baseline gap-2 text-sm">
          <span className="font-semibold">
            {p.priceMaxMinor !== p.priceMinMinor && (
              <span className="font-normal text-muted-foreground">From </span>
            )}
            <Money minor={p.priceMinMinor} currency={p.currency} trimZeros />
          </span>
          {onSale && (
            <span className="text-xs text-muted-foreground line-through">
              <Money minor={p.compareAtMinor!} currency={p.currency} trimZeros />
            </span>
          )}
        </p>
      </div>
    </Link>
  );
}
