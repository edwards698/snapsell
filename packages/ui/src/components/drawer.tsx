'use client';

import * as React from 'react';
import { Drawer as Vaul } from 'vaul';
import { cn } from '../lib/utils';

/** Bottom sheet for mobile (BUILD_PLAN §2.1 – primary actions in the thumb zone). */
export const Drawer = Vaul.Root;
export const DrawerTrigger = Vaul.Trigger;
export const DrawerClose = Vaul.Close;

export function DrawerContent({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof Vaul.Content>) {
  return (
    <Vaul.Portal>
      <Vaul.Overlay className="fixed inset-0 z-50 bg-overlay" />
      <Vaul.Content
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-3xl border-t border-border bg-surface-raised pb-[env(safe-area-inset-bottom)] focus:outline-none',
          className,
        )}
        {...props}
      >
        <div
          className="mx-auto mt-3 mb-1 h-1.5 w-10 shrink-0 rounded-full bg-border-strong"
          aria-hidden
        />
        {children}
      </Vaul.Content>
    </Vaul.Portal>
  );
}

export function DrawerHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('grid gap-1 px-5 pt-3 pb-2', className)} {...props} />;
}

export function DrawerTitle({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof Vaul.Title>) {
  return (
    <Vaul.Title className={cn('text-lg font-semibold tracking-tight', className)} {...props} />
  );
}

export function DrawerDescription({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof Vaul.Description>) {
  return <Vaul.Description className={cn('text-sm text-muted-foreground', className)} {...props} />;
}
