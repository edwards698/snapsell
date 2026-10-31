'use client';

import { Check, ChevronDown } from 'lucide-react';
import { Select as SelectPrimitive } from 'radix-ui';
import * as React from 'react';
import { cn } from '../lib/utils';

export interface SelectOption {
  value: string;
  label: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
}

/** Native-feeling select built on Radix (keyboard, typeahead, screen readers). */
export const Select = React.forwardRef<
  HTMLButtonElement,
  {
    value: string;
    onValueChange: (value: string) => void;
    options: SelectOption[];
    placeholder?: string;
    className?: string;
    contentClassName?: string;
    id?: string;
    disabled?: boolean;
    'aria-label'?: string;
    'aria-invalid'?: boolean;
    'aria-describedby'?: string;
    size?: 'sm' | 'md';
    footer?: React.ReactNode;
  }
>(
  (
    {
      value,
      onValueChange,
      options,
      placeholder,
      className,
      contentClassName,
      size = 'md',
      footer,
      ...props
    },
    ref,
  ) => (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={props.disabled}>
      <SelectPrimitive.Trigger
        ref={ref}
        id={props.id}
        aria-label={props['aria-label']}
        aria-invalid={props['aria-invalid']}
        aria-describedby={props['aria-describedby']}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-lg border border-input bg-surface px-3.5 text-left text-foreground shadow-xs transition-[border-color,box-shadow]',
          'focus-visible:border-ring focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/15 disabled:opacity-60',
          'data-[placeholder]:text-muted-foreground aria-invalid:border-danger',
          size === 'sm' ? 'h-9 text-sm' : 'h-11 text-base sm:h-10 sm:text-sm',
          className,
        )}
      >
        <span className="truncate">
          <SelectPrimitive.Value placeholder={placeholder} />
        </span>
        <SelectPrimitive.Icon>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className={cn(
            'z-50 max-h-[min(var(--radix-select-content-available-height),22rem)] min-w-(--radix-select-trigger-width) overflow-hidden rounded-xl border border-border bg-surface-raised shadow-lg',
            'data-[state=open]:animate-scale-in data-[state=closed]:animate-scale-out',
            contentClassName,
          )}
        >
          <SelectPrimitive.Viewport className="p-1.5">
            {options.map((o) => (
              <SelectPrimitive.Item
                key={o.value}
                value={o.value}
                disabled={o.disabled}
                className="relative flex cursor-default select-none items-center gap-2 rounded-lg py-2 pl-8 pr-3 text-sm outline-none data-[highlighted]:bg-muted data-[disabled]:opacity-50"
              >
                <SelectPrimitive.ItemIndicator className="absolute left-2.5 inline-flex">
                  <Check className="size-4 text-primary" />
                </SelectPrimitive.ItemIndicator>
                <div className="grid">
                  <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                  {o.description && (
                    <span className="text-xs text-muted-foreground">{o.description}</span>
                  )}
                </div>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
          {footer && <div className="border-t border-border p-1.5">{footer}</div>}
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  ),
);
Select.displayName = 'Select';
