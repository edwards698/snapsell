import type { StockState } from '@snapsell/shared';
import { Badge } from '@snapsell/ui';

const LABEL: Record<StockState, (n: number) => string> = {
  ok: (n) => `${n} in stock`,
  low: (n) => `Low · ${n} left`,
  out: () => 'Out of stock',
};

export function StockBadge({
  state,
  available,
  className,
}: {
  state: StockState;
  available: number;
  className?: string;
}) {
  return (
    <Badge
      tone={state === 'ok' ? 'success' : state === 'low' ? 'warning' : 'danger'}
      dot
      className={className}
    >
      {LABEL[state](available)}
    </Badge>
  );
}

const STATUS = {
  ACTIVE: { label: 'Active', tone: 'success' },
  INACTIVE: { label: 'Hidden', tone: 'neutral' },
  UNAVAILABLE: { label: 'Unavailable', tone: 'warning' },
  ARCHIVED: { label: 'Archived', tone: 'outline' },
} as const;

export function ProductStatusBadge({
  status,
  className,
}: {
  status: keyof typeof STATUS;
  className?: string;
}) {
  const s = STATUS[status];
  return (
    <Badge tone={s.tone} className={className}>
      {s.label}
    </Badge>
  );
}

export const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Active', description: 'In your shop and known to the assistant' },
  { value: 'INACTIVE', label: 'Hidden', description: 'Only you can see it' },
  { value: 'UNAVAILABLE', label: 'Unavailable', description: 'Shown, but can’t be ordered' },
];
