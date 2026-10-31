import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '../lib/utils';

export const badgeVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      tone: {
        neutral: 'bg-muted text-muted-foreground',
        primary: 'bg-primary-soft text-primary-soft-foreground',
        success: 'bg-success-soft text-success-soft-foreground',
        warning: 'bg-warning-soft text-warning-soft-foreground',
        danger: 'bg-danger-soft text-danger-soft-foreground',
        info: 'bg-info-soft text-info-soft-foreground',
        ai: 'bg-ai-soft text-ai-soft-foreground',
        outline: 'border border-border text-muted-foreground',
      },
      size: {
        sm: 'h-5 px-2 text-[11px]',
        md: 'h-6 px-2.5 text-xs',
      },
    },
    defaultVariants: { tone: 'neutral', size: 'md' },
  },
);

const DOT: Record<string, string> = {
  neutral: 'bg-muted-foreground/60',
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  ai: 'bg-ai',
  outline: 'bg-muted-foreground/60',
};

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  /** Status dot – status is never conveyed by colour alone, so keep a text label too. */
  dot?: boolean;
  pulse?: boolean;
}

export function Badge({ className, tone, size, dot, pulse, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone, size }), className)} {...props}>
      {dot && (
        <span className="relative flex size-1.5" aria-hidden>
          {pulse && (
            <span
              className={cn(
                'absolute inset-0 animate-ping rounded-full opacity-60',
                DOT[tone ?? 'neutral'],
              )}
            />
          )}
          <span className={cn('relative size-1.5 rounded-full', DOT[tone ?? 'neutral'])} />
        </span>
      )}
      {children}
    </span>
  );
}
