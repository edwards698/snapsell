'use client';

import type { StockState } from '@snapsell/shared';
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  QuantityInput,
  toast,
} from '@snapsell/ui';
import { useState } from 'react';
import { useAdjustStock } from '@/lib/catalog';
import { ApiRequestError } from '@/lib/api';
import { StockBadge } from './stock-badge';

/** Inline stock count for single-variant products (BUILD_PLAN Phase 2: inline stock edit). */
export function QuickStock({
  variantId,
  name,
  onHand,
  available,
  state,
}: {
  variantId: string;
  name: string;
  onHand: number;
  available: number;
  state: StockState;
}) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(onHand);
  const adjust = useAdjustStock();

  async function save() {
    try {
      await adjust.mutateAsync({
        variantId,
        input: { mode: 'set', quantity: count, reason: 'COUNT', note: 'Quick edit' },
      });
      toast.success(`${name}: ${count} on hand`);
      setOpen(false);
    } catch (err) {
      toast.error(
        err instanceof ApiRequestError
          ? (Object.values(err.fields)[0] ?? err.message)
          : 'Couldn’t update stock',
      );
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setCount(onHand);
      }}
    >
      <PopoverTrigger
        className="rounded-full transition-opacity hover:opacity-80"
        aria-label={`Edit stock for ${name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <StockBadge state={state} available={available} />
      </PopoverTrigger>
      <PopoverContent className="grid w-64 gap-3" onClick={(e) => e.stopPropagation()}>
        <div>
          <p className="text-sm font-medium">Units on hand</p>
          <p className="text-xs text-muted-foreground">Recorded as a stock count correction.</p>
        </div>
        <QuantityInput
          value={count}
          onValueChange={setCount}
          aria-label="Units on hand"
          size="sm"
        />
        <Button
          size="sm"
          onClick={() => void save()}
          loading={adjust.isPending}
          disabled={count === onHand}
        >
          Save
        </Button>
      </PopoverContent>
    </Popover>
  );
}
