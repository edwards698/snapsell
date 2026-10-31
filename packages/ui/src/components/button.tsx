import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import * as React from 'react';
import { cn } from '../lib/utils';
import { Spinner } from './spinner';

export const buttonVariants = cva(
  [
    'relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium',
    'transition-[background-color,color,box-shadow,transform] duration-150 select-none',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
    'disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary-hover',
        secondary: 'bg-muted text-foreground hover:bg-subtle',
        outline: 'border border-border-strong bg-surface text-foreground shadow-xs hover:bg-muted',
        ghost: 'text-foreground hover:bg-muted',
        soft: 'bg-primary-soft text-primary-soft-foreground hover:bg-primary-soft/70',
        danger: 'bg-danger text-danger-foreground shadow-xs hover:bg-danger-hover',
        link: 'h-auto px-0 text-primary underline-offset-4 hover:underline active:scale-100',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-5 text-base',
        icon: 'size-10',
        'icon-sm': 'size-8',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, loading, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot.Root : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <>
            {loading && (
              <span className="absolute inset-0 flex items-center justify-center">
                <Spinner />
              </span>
            )}
            <span className={cn('inline-flex items-center gap-2', loading && 'invisible')}>
              {children}
            </span>
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = 'Button';
