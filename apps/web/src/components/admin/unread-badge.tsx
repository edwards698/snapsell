'use client';

import { cn } from '@snapsell/ui';
import { useUnread } from '@/lib/inbox';

/** Count of conversations with unread customer messages. */
export function UnreadBadge({ className }: { className?: string }) {
  const { data } = useUnread();
  const count = data?.conversations ?? 0;
  if (!count) return null;
  return (
    <span
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold tabular-nums text-primary-foreground',
        className,
      )}
      aria-label={`${count} unread conversation${count === 1 ? '' : 's'}`}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
