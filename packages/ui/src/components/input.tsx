import * as React from 'react';
import { cn } from '../lib/utils';

export const inputClass = cn(
  'flex h-11 w-full min-w-0 rounded-lg border border-input bg-surface px-3.5 text-base text-foreground shadow-xs sm:h-10 sm:text-sm',
  'placeholder:text-muted-foreground/80 transition-[border-color,box-shadow] duration-150',
  'focus-visible:border-ring focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/15',
  'disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70',
  'aria-invalid:border-danger aria-invalid:focus-visible:ring-danger/15',
);

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type = 'text', ...props }, ref) => (
  <input ref={ref} type={type} className={cn(inputClass, className)} {...props} />
));
Input.displayName = 'Input';
