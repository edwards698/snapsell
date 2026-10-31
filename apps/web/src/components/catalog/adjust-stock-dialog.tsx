'use client';

import { ADJUSTMENT_REASONS, type AdjustmentReason, stockAdjustmentSchema } from '@snapsell/shared';
import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  QuantityInput,
  SegmentedControl,
  Select,
  toast,
} from '@snapsell/ui';
import { ArrowRight, Minus, Plus, Equal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useFormErrors } from '@/components/auth/use-form-errors';
import { useAdjustStock } from '@/lib/catalog';

export interface AdjustTarget {
  variantId: string;
  title: string;
  subtitle?: string;
  onHand: number;
  reserved: number;
}

type Mode = 'add' | 'remove' | 'set';

const DEFAULT_REASON: Record<Mode, AdjustmentReason> = {
  add: 'RECEIVED',
  remove: 'DAMAGED',
  set: 'COUNT',
};

export function AdjustStockDialog({
  target,
  onOpenChange,
  initialMode = 'add',
}: {
  target: AdjustTarget | null;
  onOpenChange: (open: boolean) => void;
  initialMode?: Mode;
}) {
  const adjust = useAdjustStock();
  const errors = useFormErrors();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState<AdjustmentReason>(DEFAULT_REASON[initialMode]);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!target) return;
    setMode(initialMode);
    setQuantity(initialMode === 'set' ? target.onHand : 1);
    setReason(DEFAULT_REASON[initialMode]);
    setNote('');
    errors.clear();
    // Reset only when a different variant is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.variantId, initialMode]);

  if (!target) return null;
  const after =
    mode === 'add'
      ? target.onHand + quantity
      : mode === 'remove'
        ? target.onHand - quantity
        : quantity;
  const belowReserved = after < target.reserved;

  function changeMode(next: Mode) {
    setMode(next);
    setReason(DEFAULT_REASON[next]);
    setQuantity(next === 'set' ? target!.onHand : 1);
    errors.clear();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const input = errors.validate(stockAdjustmentSchema, { mode, quantity, reason, note });
    if (!input) return;
    try {
      await adjust.mutateAsync({ variantId: target!.variantId, input });
      toast.success('Stock updated', {
        description: `${target!.title}: ${target!.onHand} → ${after} on hand`,
      });
      onOpenChange(false);
    } catch (err) {
      errors.fromError(err);
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-5" noValidate>
          <DialogHeader>
            <DialogTitle>Adjust stock</DialogTitle>
            <DialogDescription>
              {target.title}
              {target.subtitle && (
                <span className="text-muted-foreground"> · {target.subtitle}</span>
              )}
            </DialogDescription>
          </DialogHeader>

          <SegmentedControl
            aria-label="Adjustment type"
            value={mode}
            onValueChange={changeMode}
            className="w-full"
            options={[
              { value: 'add', label: 'Add', icon: <Plus /> },
              { value: 'remove', label: 'Remove', icon: <Minus /> },
              { value: 'set', label: 'Set count', icon: <Equal /> },
            ]}
          />

          <Field
            label={mode === 'set' ? 'Units on hand' : 'Quantity'}
            error={errors.fields.quantity}
          >
            <QuantityInput
              value={quantity}
              onValueChange={(n) => (setQuantity(n), errors.clear('quantity'))}
              min={0}
            />
          </Field>

          <div
            className={cn(
              'flex items-center justify-center gap-4 rounded-xl px-4 py-3 text-sm tabular',
              belowReserved ? 'bg-danger-soft text-danger-soft-foreground' : 'bg-muted',
            )}
            aria-live="polite"
          >
            <span>
              <span className="text-muted-foreground">On hand</span>{' '}
              <strong>{target.onHand}</strong>
            </span>
            <ArrowRight className="size-4 text-muted-foreground" />
            <strong className="text-base">{Math.max(after, 0)}</strong>
            {target.reserved > 0 && (
              <span className="text-muted-foreground">({target.reserved} reserved)</span>
            )}
          </div>

          <Field label="Reason">
            <Select
              value={reason}
              onValueChange={(v) => setReason(v as AdjustmentReason)}
              options={Object.entries(ADJUSTMENT_REASONS).map(([value, r]) => ({
                value,
                label: r.label,
              }))}
            />
          </Field>
          <Field
            label="Note"
            hint={reason === 'OTHER' ? undefined : 'Optional'}
            error={errors.fields.note}
          >
            <Input
              value={note}
              onChange={(e) => (setNote(e.target.value), errors.clear('note'))}
              maxLength={200}
              placeholder="e.g. Delivery from supplier"
            />
          </Field>

          {errors.form && <p className="text-sm text-danger">{errors.form.message}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={adjust.isPending} disabled={belowReserved}>
              Save adjustment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
