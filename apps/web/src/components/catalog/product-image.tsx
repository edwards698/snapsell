import type { ImageDto } from '@snapsell/shared';
import { cn } from '@snapsell/ui';
import { ImageIcon } from 'lucide-react';

/**
 * Responsive product photo: AVIF with WebP fallback at the pre-rendered widths, over a blurred
 * placeholder while it loads (BUILD_PLAN §2.4).
 */
export function ProductImage({
  image,
  sizes,
  className,
  alt,
  priority,
}: {
  image: ImageDto | null;
  sizes: string;
  className?: string;
  alt?: string;
  priority?: boolean;
}) {
  if (!image) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-muted text-muted-foreground/60',
          className,
        )}
        aria-hidden
      >
        <ImageIcon className="size-1/4 max-h-8 max-w-8" />
      </div>
    );
  }
  return (
    <picture className={cn('block overflow-hidden bg-muted', className)}>
      <source type="image/avif" srcSet={image.srcSet.avif} sizes={sizes} />
      <source type="image/webp" srcSet={image.srcSet.webp} sizes={sizes} />
      <img
        src={image.src}
        alt={alt ?? image.alt}
        width={image.width}
        height={image.height}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        className="size-full object-cover"
        style={
          image.blurDataUrl
            ? { backgroundImage: `url(${image.blurDataUrl})`, backgroundSize: 'cover' }
            : undefined
        }
      />
    </picture>
  );
}
