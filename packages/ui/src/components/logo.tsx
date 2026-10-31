import { cn } from '../lib/utils';

/** SnapSell mark: a chat bubble with a spark – "snap, chat, get paid". */
export function LogoMark({ className }: { className?: string }) {
  // Solid fills only: a gradient referenced by id breaks when the first copy of the id is hidden.
  return (
    <svg viewBox="0 0 32 32" className={cn('size-8 shrink-0', className)} aria-hidden>
      <rect width="32" height="32" rx="9" className="fill-primary" />
      <path
        d="M0 9a9 9 0 0 1 9-9h14a9 9 0 0 1 9 9v5C22 18 10 18 0 13.5Z"
        fill="white"
        opacity="0.12"
      />
      <path
        d="M9 11.5A3.5 3.5 0 0 1 12.5 8h7A3.5 3.5 0 0 1 23 11.5v5a3.5 3.5 0 0 1-3.5 3.5h-4.2l-3.6 3.1c-.5.4-1.2.1-1.2-.6V20A3.5 3.5 0 0 1 9 16.5v-5Z"
        fill="white"
      />
      <path d="m16.6 10.6-2.9 4.1h2.3l-.6 3.7 2.9-4.2H16l.6-3.6Z" className="fill-primary" />
    </svg>
  );
}

export function Logo({ className, name = 'SnapSell' }: { className?: string; name?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark />
      <span className="text-[15px] font-semibold tracking-tight">{name}</span>
    </span>
  );
}
