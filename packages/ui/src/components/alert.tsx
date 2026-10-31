import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/utils';

const TONES = {
  info: { icon: Info, className: 'bg-info-soft text-info-soft-foreground' },
  success: { icon: CircleCheck, className: 'bg-success-soft text-success-soft-foreground' },
  warning: { icon: TriangleAlert, className: 'bg-warning-soft text-warning-soft-foreground' },
  danger: { icon: CircleAlert, className: 'bg-danger-soft text-danger-soft-foreground' },
} as const;

export interface AlertProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  tone?: keyof typeof TONES;
  title?: React.ReactNode;
}

export function Alert({ tone = 'info', title, className, children, ...props }: AlertProps) {
  const { icon: Icon, className: toneClass } = TONES[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'flex gap-3 rounded-xl px-4 py-3 text-sm animate-slide-up',
        toneClass,
        className,
      )}
      {...props}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="grid gap-0.5">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="opacity-90">{children}</div>}
      </div>
    </div>
  );
}
