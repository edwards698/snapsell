'use client';

import { Popover as PopoverPrimitive } from 'radix-ui';
import * as React from 'react';
import { cn } from '../lib/utils';

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverClose = PopoverPrimitive.Close;

export function PopoverContent({
  className,
  align = 'start',
  sideOffset = 6,
  ...props
}: React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'z-50 w-72 rounded-xl border border-border bg-surface-raised p-4 shadow-lg outline-none',
          'data-[state=open]:animate-scale-in data-[state=closed]:animate-scale-out origin-(--radix-popover-content-transform-origin)',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
