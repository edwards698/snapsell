import { cn } from '../lib/utils';

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div aria-hidden className={cn('animate-shimmer rounded-lg bg-muted', className)} {...props} />
  );
}
