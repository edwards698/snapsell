'use client';

import { DropdownMenu as Menu } from 'radix-ui';
import * as React from 'react';
import { cn } from '../lib/utils';

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export const DropdownMenuGroup = Menu.Group;

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentPropsWithoutRef<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-52 overflow-hidden rounded-xl border border-border bg-surface-raised p-1.5 shadow-lg',
          'data-[state=open]:animate-scale-in data-[state=closed]:animate-scale-out origin-(--radix-dropdown-menu-content-transform-origin)',
          className,
        )}
        {...props}
      />
    </Menu.Portal>
  );
}

export function DropdownMenuItem({
  className,
  tone,
  ...props
}: React.ComponentPropsWithoutRef<typeof Menu.Item> & { tone?: 'danger' }) {
  return (
    <Menu.Item
      className={cn(
        'flex cursor-default select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none transition-colors',
        'data-[highlighted]:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        "[&_svg:not([class*='size-'])]:size-4 [&_svg]:text-muted-foreground",
        tone === 'danger' && 'text-danger [&_svg]:text-danger data-[highlighted]:bg-danger-soft',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof Menu.Label>) {
  return (
    <Menu.Label
      className={cn('px-2.5 py-2 text-xs font-medium text-muted-foreground', className)}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof Menu.Separator>) {
  return <Menu.Separator className={cn('-mx-1.5 my-1.5 h-px bg-border', className)} {...props} />;
}
