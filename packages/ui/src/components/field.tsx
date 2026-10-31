'use client';

import { CircleAlert } from 'lucide-react';
import { Label as LabelPrimitive } from 'radix-ui';
import * as React from 'react';
import { cn } from '../lib/utils';

export const Label = React.forwardRef<
  React.ComponentRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn('text-sm font-medium text-foreground', className)}
    {...props}
  />
));
Label.displayName = 'Label';

interface FieldContextValue {
  id: string;
  hintId: string;
  errorId: string;
  invalid: boolean;
  describedBy: string | undefined;
}

const FieldContext = React.createContext<FieldContextValue | null>(null);

/** Accessible props for the control inside a <Field>. */
export function useFieldControl() {
  const ctx = React.useContext(FieldContext);
  if (!ctx) return {};
  return {
    id: ctx.id,
    'aria-invalid': ctx.invalid || undefined,
    'aria-describedby': ctx.describedBy,
  };
}

export interface FieldProps {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string;
  /** Rendered at the right of the label row, e.g. a "Forgot password?" link. */
  action?: React.ReactNode;
  className?: string;
  children: React.ReactElement;
}

/** Label + control + hint + error, wired together for screen readers. */
export function Field({ label, hint, error, action, className, children }: FieldProps) {
  const id = React.useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined;
  const value = { id, hintId, errorId, invalid: !!error, describedBy };
  const control = React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
  });

  return (
    <FieldContext.Provider value={value}>
      <div className={cn('grid gap-1.5', className)}>
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={id}>{label}</Label>
          {action}
        </div>
        {control}
        {hint && !error && (
          <p id={hintId} className="text-xs text-muted-foreground">
            {hint}
          </p>
        )}
        {error && (
          <p
            id={errorId}
            role="alert"
            className="flex items-center gap-1.5 text-xs font-medium text-danger animate-fade-in"
          >
            <CircleAlert className="size-3.5 shrink-0" aria-hidden />
            {error}
          </p>
        )}
      </div>
    </FieldContext.Provider>
  );
}
