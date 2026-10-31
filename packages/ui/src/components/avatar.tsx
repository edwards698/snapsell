import { cn } from '../lib/utils';

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')).toUpperCase() ||
    '?'
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-hover text-xs font-semibold text-primary-foreground',
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
