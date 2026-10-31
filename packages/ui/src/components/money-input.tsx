'use client';

import { formatMoney, minorDigits, toMinor } from '@snapsell/shared';
import * as React from 'react';
import { cn } from '../lib/utils';
import { inputClass } from './input';

const SYMBOLS: Record<string, string> = { ZMW: 'K', USD: '$', EUR: '€' };

function toText(minor: number | null, currency: string) {
  if (minor === null) return '';
  return formatMoney(minor, currency, { trimZeros: true }).replace(/[^\d.]/g, '');
}

/**
 * Decimal money entry that reports integer minor units (BUILD_PLAN D2). Keeps the typed text while
 * editing and normalises it on blur.
 */
export const MoneyInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
    value: number | null;
    onValueChange: (minor: number | null) => void;
    currency: string;
  }
>(({ value, onValueChange, currency, className, onBlur, ...props }, ref) => {
  const [text, setText] = React.useState(() => toText(value, currency));
  const last = React.useRef(value);
  React.useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setText(toText(value, currency));
    }
  }, [value, currency]);

  const digits = minorDigits(currency);
  const symbol = SYMBOLS[currency] ?? currency;
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm text-muted-foreground">
        {symbol}
      </span>
      <input
        ref={ref}
        inputMode="decimal"
        autoComplete="off"
        value={text}
        className={cn(inputClass, 'tabular', symbol.length > 1 ? 'pl-12' : 'pl-8', className)}
        onChange={(e) => {
          const next = e.target.value.replace(/,/g, '');
          if (!new RegExp(`^\\d*(\\.\\d{0,${digits}})?$`).test(next)) return;
          setText(next);
          let minor: number | null = null;
          if (next && next !== '.') {
            try {
              minor = toMinor(next.endsWith('.') ? next.slice(0, -1) : next, currency);
            } catch {
              minor = null;
            }
          }
          last.current = minor;
          onValueChange(minor);
        }}
        onBlur={(e) => {
          setText(toText(last.current, currency));
          onBlur?.(e);
        }}
        {...props}
      />
    </div>
  );
});
MoneyInput.displayName = 'MoneyInput';
