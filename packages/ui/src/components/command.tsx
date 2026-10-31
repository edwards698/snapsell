'use client';

import { Command as Cmdk } from 'cmdk';
import { Search } from 'lucide-react';
import { Dialog as DialogPrimitive, VisuallyHidden } from 'radix-ui';
import * as React from 'react';
import { cn } from '../lib/utils';
import { DialogOverlay } from './dialog';

export function CommandDialog({
  open,
  onOpenChange,
  children,
  placeholder = 'Search or jump to…',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  placeholder?: string;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogOverlay />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-[12dvh] z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-lg',
            'data-[state=open]:animate-scale-in data-[state=closed]:animate-scale-out focus:outline-none',
          )}
        >
          <VisuallyHidden.Root>
            <DialogPrimitive.Title>Command menu</DialogPrimitive.Title>
          </VisuallyHidden.Root>
          <Cmdk loop className="flex max-h-[min(28rem,70dvh)] flex-col">
            <div className="flex items-center gap-3 border-b border-border px-4">
              <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <Cmdk.Input
                placeholder={placeholder}
                className="h-14 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm"
              />
            </div>
            <Cmdk.List className="overflow-y-auto overscroll-contain p-2">
              <Cmdk.Empty className="py-10 text-center text-sm text-muted-foreground">
                No results found.
              </Cmdk.Empty>
              {children}
            </Cmdk.List>
          </Cmdk>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function CommandGroup({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof Cmdk.Group>) {
  return (
    <Cmdk.Group
      className={cn(
        '[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function CommandItem({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof Cmdk.Item>) {
  return (
    <Cmdk.Item
      className={cn(
        'flex cursor-default select-none items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm outline-none',
        'data-[selected=true]:bg-muted data-[disabled=true]:opacity-50',
        "[&_svg:not([class*='size-'])]:size-4 [&_svg]:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function CommandSeparator() {
  return <Cmdk.Separator className="-mx-2 my-2 h-px bg-border" />;
}
