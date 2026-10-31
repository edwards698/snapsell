import { formatMoney } from '@snapsell/shared';
import { cn } from '../lib/utils';

export function Money({
  minor,
  currency,
  trimZeros,
  className,
}: {
  minor: number;
  currency: string;
  trimZeros?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('tabular', className)}>{formatMoney(minor, currency, { trimZeros })}</span>
  );
}
