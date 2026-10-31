'use client';

import { Minus, Plus } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/utils';

/** Whole-number stepper with large touch targets. */
export const QuantityInput = React.forwardRef<
  HTMLInputElement,
  {
    value: number;
    onValueChange: (value: number) => void;
    min?: number;
    max?: number;
    className?: string;
    size?: 'sm' | 'md';
    id?: string;
    'aria-label'?: string;
    'aria-invalid'?: boolean;
    'aria-describedby'?: string;
  }
>(({ value, onValueChange, min = 0, max = 1_000_000, className, size = 'md', ...props }, ref) => {
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n)));
  const btn = cn(
    'flex shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40',
    size === 'sm' ? 'w-8' : 'w-11',
  );
  return (
    <div
      className={cn(
        'flex overflow-hidden rounded-lg border border-input bg-surface shadow-xs focus-within:border-ring focus-within:ring-4 focus-within:ring-ring/15',
        size === 'sm' ? 'h-9' : 'h-11 sm:h-10',
        className,
      )}
    >
      <button
        type="button"
        className={btn}
        onClick={() => onValueChange(clamp(value - 1))}
        disabled={value <= min}
        aria-label="Decrease"
      >
        <Minus className="size-4" />
      </button>
      <input
        ref={ref}
        inputMode="numeric"
        value={Number.isFinite(value) ? String(value) : ''}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '');
          onValueChange(digits ? clamp(Number(digits)) : min);
        }}
        className="w-full min-w-10 bg-transparent text-center text-base font-medium tabular outline-none sm:text-sm"
        {...props}
      />
      <button
        type="button"
        className={btn}
        onClick={() => onValueChange(clamp(value + 1))}
        disabled={value >= max}
        aria-label="Increase"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
});
QuantityInput.displayName = 'QuantityInput';
