import { type LucideIcon } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/utils';

export interface EmptyStateProps {
  icon: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  tone?: 'primary' | 'ai' | 'neutral';
}

const ICON_TONE = {
  primary: 'bg-primary-soft text-primary-soft-foreground',
  ai: 'bg-ai-soft text-ai-soft-foreground',
  neutral: 'bg-muted text-muted-foreground',
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  tone = 'primary',
}: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center sm:py-16', className)}>
      <div className="relative mb-5">
        <div
          className={cn('absolute -inset-3 rounded-[1.75rem] opacity-40 blur-xl', ICON_TONE[tone])}
          aria-hidden
        />
        <div
          className={cn(
            'relative flex size-14 items-center justify-center rounded-2xl',
            ICON_TONE[tone],
          )}
        >
          <Icon className="size-6" aria-hidden />
        </div>
      </div>
      <h3 className="text-base font-semibold tracking-tight text-balance">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground text-balance">{description}</p>
      )}
      {action && <div className="mt-6 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
