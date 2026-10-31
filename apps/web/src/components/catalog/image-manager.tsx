'use client';

import type { ImageDto } from '@snapsell/shared';
import { MAX_IMAGES_PER_PRODUCT } from '@snapsell/shared';
import {
  Badge,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Spinner,
} from '@snapsell/ui';
import { ArrowLeft, ArrowRight, Camera, Ellipsis, ImagePlus, Star, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ProductImage } from './product-image';

export type ImageItem =
  | { key: string; kind: 'saved'; image: ImageDto }
  | { key: string; kind: 'pending'; file: File; url: string }
  | { key: string; kind: 'uploading'; url: string };

const ACCEPT = 'image/jpeg,image/png,image/webp,image/avif,image/gif';

/**
 * Photo grid with add, reorder, make-cover and remove. The first photo is the cover.
 * The parent decides whether changes upload immediately (existing product) or wait for save.
 */
export function ImageManager({
  items,
  onAdd,
  onRemove,
  onMove,
  disabled,
}: {
  items: ImageItem[];
  onAdd: (files: File[]) => void;
  onRemove: (key: string) => void;
  onMove: (key: string, to: number) => void;
  disabled?: boolean;
}) {
  const pick = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const full = items.length >= MAX_IMAGES_PER_PRODUCT;

  function accept(list: FileList | null) {
    const files = Array.from(list ?? []).filter((f) => f.type.startsWith('image/'));
    if (files.length) onAdd(files.slice(0, MAX_IMAGES_PER_PRODUCT - items.length));
  }

  return (
    <div className="grid gap-3">
      <ul className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
        {items.map((item, i) => (
          <li
            key={item.key}
            className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-muted"
          >
            {item.kind === 'saved' ? (
              <ProductImage image={item.image} sizes="160px" className="size-full" />
            ) : (
              <img
                src={item.url}
                alt=""
                className={cn('size-full object-cover', item.kind === 'uploading' && 'opacity-50')}
              />
            )}
            {item.kind === 'uploading' && (
              <span className="absolute inset-0 flex items-center justify-center">
                <Spinner className="size-6 text-foreground" label="Uploading" />
              </span>
            )}
            {i === 0 && (
              <Badge tone="primary" size="sm" className="absolute left-1.5 top-1.5 shadow-sm">
                Cover
              </Badge>
            )}
            {item.kind !== 'uploading' && !disabled && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="absolute right-1.5 top-1.5 flex size-8 items-center justify-center rounded-full bg-surface/90 text-foreground shadow-sm backdrop-blur transition-opacity hover:bg-surface sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 sm:data-[state=open]:opacity-100"
                  aria-label={`Photo ${i + 1} options`}
                >
                  <Ellipsis className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-44">
                  {i > 0 && (
                    <DropdownMenuItem onSelect={() => onMove(item.key, 0)}>
                      <Star /> Make cover
                    </DropdownMenuItem>
                  )}
                  {i > 0 && (
                    <DropdownMenuItem onSelect={() => onMove(item.key, i - 1)}>
                      <ArrowLeft /> Move earlier
                    </DropdownMenuItem>
                  )}
                  {i < items.length - 1 && (
                    <DropdownMenuItem onSelect={() => onMove(item.key, i + 1)}>
                      <ArrowRight /> Move later
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem tone="danger" onSelect={() => onRemove(item.key)}>
                    <Trash2 /> Remove
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </li>
        ))}
        {!full && !disabled && (
          <li
            className={cn(
              'aspect-square',
              items.length === 0 && 'col-span-3 aspect-auto sm:col-span-4',
            )}
          >
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                accept(e.dataTransfer.files);
              }}
              className={cn(
                'flex size-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-strong p-3 text-center transition-colors',
                dragging
                  ? 'border-primary bg-primary-soft'
                  : 'hover:border-primary/60 hover:bg-muted/50',
                items.length === 0 && 'py-10',
              )}
            >
              {items.length === 0 ? (
                <>
                  <span className="flex size-11 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-foreground">
                    <ImagePlus className="size-5" />
                  </span>
                  <p className="text-sm font-medium">Add photos</p>
                  <p className="text-xs text-muted-foreground">
                    Drag photos here, or use the buttons. The first one is the cover.
                  </p>
                  <div className="mt-2 flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => camera.current?.click()}
                      className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground sm:hidden"
                    >
                      <Camera className="size-4" /> Take photo
                    </button>
                    <button
                      type="button"
                      onClick={() => pick.current?.click()}
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 text-sm font-medium"
                    >
                      <ImagePlus className="size-4" /> Choose photos
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => pick.current?.click()}
                  className="flex size-full flex-col items-center justify-center gap-1.5 text-muted-foreground"
                  aria-label="Add photos"
                >
                  <ImagePlus className="size-5" />
                  <span className="text-xs font-medium">Add</span>
                </button>
              )}
            </div>
          </li>
        )}
      </ul>
      <p className="text-xs text-muted-foreground">
        Up to {MAX_IMAGES_PER_PRODUCT} photos. Location data is removed automatically.
      </p>
      <input
        ref={pick}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => (accept(e.target.files), (e.target.value = ''))}
      />
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => (accept(e.target.files), (e.target.value = ''))}
      />
    </div>
  );
}

/** Object URLs for pending files, revoked when they are no longer shown. */
export function usePreviewUrls() {
  const urls = useRef(new Set<string>());
  useEffect(() => {
    const set = urls.current;
    return () => set.forEach((u) => URL.revokeObjectURL(u));
  }, []);
  return (file: Blob) => {
    const url = URL.createObjectURL(file);
    urls.current.add(url);
    return url;
  };
}
