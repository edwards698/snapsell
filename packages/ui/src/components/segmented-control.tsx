'use client';

import { ToggleGroup } from 'radix-ui';
import * as React from 'react';
import { cn } from '../lib/utils';

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
}

/** A compact single-choice control, e.g. Delivery / Collection or System / Light / Dark. */
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  className,
  size = 'md',
  'aria-label': ariaLabel,
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: SegmentedOption<T>[];
  className?: string;
  size?: 'sm' | 'md';
  'aria-label': string;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onValueChange(v as T)}
      aria-label={ariaLabel}
      className={cn('inline-flex rounded-xl bg-muted p-1', className)}
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          disabled={o.disabled}
          className={cn(
            'inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium text-muted-foreground transition-all',
            'hover:text-foreground disabled:opacity-50 data-[state=on]:bg-surface data-[state=on]:text-foreground data-[state=on]:shadow-sm',
            "[&_svg:not([class*='size-'])]:size-4",
            size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-9 px-3.5 text-sm',
          )}
        >
          {o.icon}
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
