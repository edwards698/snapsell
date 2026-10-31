'use client';

import { type ShopSettings, shopSettingsSchema } from '@snapsell/shared';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  Input,
  MoneyInput,
  Select,
  Skeleton,
  Switch,
  toast,
} from '@snapsell/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useFormErrors } from '@/components/auth/use-form-errors';
import { api } from '@/lib/api';

const TTL_OPTIONS = [
  { value: '30', label: '30 minutes' },
  { value: '60', label: '1 hour' },
  { value: '120', label: '2 hours' },
  { value: '360', label: '6 hours' },
  { value: '1440', label: '24 hours' },
];

export function ShopCard() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['shop-settings'],
    queryFn: () => api<ShopSettings>('/admin/settings/shop'),
  });
  const [draft, setDraft] = useState<ShopSettings | null>(null);
  const errors = useFormErrors();
  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);
  const save = useMutation({
    mutationFn: (s: ShopSettings) =>
      api<ShopSettings>('/admin/settings/shop', { method: 'PUT', json: s }),
    onSuccess: (s) => {
      qc.setQueryData(['shop-settings'], s);
      void qc.invalidateQueries({ queryKey: ['overview'] });
      toast.success('Shop settings saved');
    },
  });

  if (!draft) return <Skeleton className="h-96 rounded-2xl" />;
  const set = (patch: Partial<ShopSettings>) => setDraft({ ...draft, ...patch });
  const dirty = JSON.stringify(draft) !== JSON.stringify(data);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!errors.validate(shopSettingsSchema, draft)) return;
    try {
      await save.mutateAsync(draft!);
    } catch (err) {
      errors.fromError(err);
    }
  }

  return (
    <Card>
      <form onSubmit={submit} noValidate>
        <CardHeader>
          <CardTitle>Shop</CardTitle>
          <CardDescription>
            How your shop appears and how customers receive their orders.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Shop name" error={errors.fields.name}>
              <Input
                value={draft.name}
                onChange={(e) => set({ name: e.target.value })}
                maxLength={60}
              />
            </Field>
            <Field
              label="Collection point"
              hint="Shown to customers who collect."
              error={errors.fields.address}
            >
              <Input
                value={draft.address}
                onChange={(e) => set({ address: e.target.value })}
                placeholder="e.g. Shop 4, Kamwala Market"
                maxLength={200}
              />
            </Field>
          </div>
          <div className="grid gap-4 rounded-xl border border-border p-4">
            <label className="flex items-center justify-between gap-4">
              <span>
                <span className="block text-sm font-medium">Collection</span>
                <span className="block text-xs text-muted-foreground">
                  Customers pick up their order for free.
                </span>
              </span>
              <Switch
                checked={draft.collectionEnabled}
                onCheckedChange={(v) => set({ collectionEnabled: v })}
              />
            </label>
            <label className="flex items-center justify-between gap-4">
              <span>
                <span className="block text-sm font-medium">Delivery</span>
                <span className="block text-xs text-muted-foreground">
                  A flat fee is added at checkout.
                </span>
              </span>
              <Switch
                checked={draft.deliveryEnabled}
                onCheckedChange={(v) => set({ deliveryEnabled: v })}
              />
            </label>
            {draft.deliveryEnabled && (
              <Field label="Delivery fee" error={errors.fields.deliveryFeeMinor}>
                <MoneyInput
                  currency={draft.currency}
                  value={draft.deliveryFeeMinor}
                  onValueChange={(m) => set({ deliveryFeeMinor: m ?? 0 })}
                  className="sm:max-w-48"
                />
              </Field>
            )}
            {errors.fields.collectionEnabled && (
              <p className="text-xs text-danger">{errors.fields.collectionEnabled}</p>
            )}
          </div>
          <Field
            label="Hold stock for unpaid orders"
            hint="After this, unpaid orders expire and their items go back on sale."
          >
            <Select
              value={String(draft.reservationTtlMinutes)}
              onValueChange={(v) => set({ reservationTtlMinutes: Number(v) })}
              options={
                TTL_OPTIONS.some((o) => o.value === String(draft.reservationTtlMinutes))
                  ? TTL_OPTIONS
                  : [
                      ...TTL_OPTIONS,
                      {
                        value: String(draft.reservationTtlMinutes),
                        label: `${draft.reservationTtlMinutes} minutes`,
                      },
                    ]
              }
              className="sm:max-w-48"
            />
          </Field>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" loading={save.isPending} disabled={!dirty}>
            Save
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
