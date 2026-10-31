'use client';

import { type CheckoutResult, checkoutSchema, type PricedCart } from '@snapsell/shared';
import {
  Alert,
  Button,
  Card,
  cn,
  Field,
  Input,
  Money,
  SegmentedControl,
  Skeleton,
  Textarea,
} from '@snapsell/ui';
import { ChevronDown, Lock, MapPin, ShoppingBag, Store, Truck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useFormErrors } from '@/components/auth/use-form-errors';
import { useCart, usePricedCart } from '@/components/store/cart';
import { CartLines } from '@/components/store/cart-lines';
import { api, ApiRequestError } from '@/lib/api';

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="mb-5 flex items-center gap-3 text-base font-semibold">
        <span className="flex size-7 items-center justify-center rounded-full bg-foreground text-xs text-background">
          {n}
        </span>
        {title}
      </h2>
      {children}
    </Card>
  );
}

function Totals({ priced, fee }: { priced: PricedCart; fee: number }) {
  return (
    <dl className="grid gap-2 text-sm">
      <div className="flex justify-between">
        <dt className="text-muted-foreground">Subtotal</dt>
        <dd>
          <Money minor={priced.subtotalMinor} currency={priced.currency} />
        </dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-muted-foreground">Delivery</dt>
        <dd>{fee ? <Money minor={fee} currency={priced.currency} /> : 'Free'}</dd>
      </div>
      <div className="mt-1 flex items-baseline justify-between border-t border-border pt-3">
        <dt className="font-semibold">Total</dt>
        <dd className="text-xl font-semibold">
          <Money minor={priced.subtotalMinor + fee} currency={priced.currency} />
        </dd>
      </div>
    </dl>
  );
}

export function CheckoutForm() {
  const router = useRouter();
  const cart = useCart();
  const { priced, setPriced } = usePricedCart();
  const errors = useFormErrors();
  const [checkoutKey] = useState(() => crypto.randomUUID());
  const [fulfilment, setFulfilment] = useState<'DELIVERY' | 'COLLECTION'>('COLLECTION');
  const [pending, setPending] = useState(false);
  const [changed, setChanged] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);

  // Default to whichever option the shop offers.
  useEffect(() => {
    if (priced && !priced.collection.enabled) setFulfilment('DELIVERY');
    else if (priced && !priced.delivery.enabled) setFulfilment('COLLECTION');
  }, [priced]);

  if (cart.count === 0 && !pending) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-muted">
          <ShoppingBag className="size-6 text-muted-foreground" />
        </span>
        <h1 className="mt-4 text-xl font-semibold">Your cart is empty</h1>
        <Button asChild className="mt-6">
          <Link href="/">Browse products</Link>
        </Button>
      </div>
    );
  }
  if (!priced) {
    return (
      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_380px]">
        <Skeleton className="h-96 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  const fee = fulfilment === 'DELIVERY' ? priced.delivery.feeMinor : 0;
  const total = priced.subtotalMinor + fee;
  const blocked = priced.lines.some((l) => l.status === 'unavailable');
  const both = priced.delivery.enabled && priced.collection.enabled;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const payload = {
      checkoutKey,
      items: cart.lines,
      fullName: form.fullName,
      phone: form.phone,
      fulfilment,
      address:
        fulfilment === 'DELIVERY'
          ? { line1: form.line1, area: form.area, city: form.city, notes: form.addressNotes }
          : undefined,
      notes: form.notes,
      expectedTotalMinor: total,
    };
    if (!errors.validate(checkoutSchema, payload)) return;
    setPending(true);
    setChanged(null);
    try {
      const res = await api<CheckoutResult>('/store/checkout', { json: payload });
      cart.clear();
      // Straight to the payment page; if no link could be made, the order page explains next steps.
      if (res.paymentUrl) window.location.assign(res.paymentUrl);
      else router.replace(`/order/${res.ref}?t=${encodeURIComponent(res.statusToken)}`);
    } catch (err) {
      setPending(false);
      if (
        err instanceof ApiRequestError &&
        (err.code === 'PRICE_CHANGED' || err.code === 'CART_CHANGED') &&
        err.details
      ) {
        const next = err.details as PricedCart;
        setPriced(next);
        // Keep what can still be bought; quantities follow what's available.
        cart.replace(
          next.lines
            .filter((l) => l.status !== 'unavailable')
            .map((l) => ({
              variantId: l.variantId,
              quantity: Math.min(l.quantity, l.maxQuantity),
            })),
        );
        setChanged(err.message);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        errors.fromError(err);
      }
    }
  }

  const f = errors.fields;
  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight sm:text-3xl">Checkout</h1>

      {/* Order summary: collapsible on phones (BUILD_PLAN §2.4). */}
      <Card className="mb-4 lg:hidden">
        <button
          type="button"
          onClick={() => setSummaryOpen((o) => !o)}
          className="flex w-full items-center justify-between p-4 text-sm"
          aria-expanded={summaryOpen}
        >
          <span className="flex items-center gap-2 font-medium">
            <ShoppingBag className="size-4" /> {summaryOpen ? 'Hide' : 'Show'} order ({cart.count}{' '}
            {cart.count === 1 ? 'item' : 'items'})
            <ChevronDown
              className={cn('size-4 transition-transform', summaryOpen && 'rotate-180')}
            />
          </span>
          <span className="font-semibold">
            <Money minor={total} currency={priced.currency} />
          </span>
        </button>
        {summaryOpen && (
          <div className="border-t border-border px-4 pb-4">
            <CartLines lines={priced.lines} currency={priced.currency} />
          </div>
        )}
      </Card>

      <form
        onSubmit={submit}
        noValidate
        className="grid items-start gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_380px]"
      >
        <div className="grid gap-4 sm:gap-6">
          {changed && (
            <Alert tone="warning" title="Your order changed">
              {changed} We’ve updated your cart – check the total and place the order again.
            </Alert>
          )}
          {errors.form && <Alert tone="danger">{errors.form.message}</Alert>}

          <Step n={1} title="Your details">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Full name" error={f.fullName}>
                <Input
                  name="fullName"
                  autoComplete="name"
                  onChange={() => errors.clear('fullName')}
                />
              </Field>
              <Field label="Phone number" hint="We’ll use it for order updates." error={f.phone}>
                <Input
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="097 123 4567"
                  onChange={() => errors.clear('phone')}
                />
              </Field>
            </div>
          </Step>

          <Step
            n={2}
            title={
              both
                ? 'Delivery or collection'
                : fulfilment === 'DELIVERY'
                  ? 'Delivery'
                  : 'Collection'
            }
          >
            <div className="grid gap-5">
              {both && (
                <SegmentedControl
                  aria-label="Delivery or collection"
                  value={fulfilment}
                  onValueChange={setFulfilment}
                  className="w-full"
                  options={[
                    { value: 'COLLECTION', label: 'Collect', icon: <Store /> },
                    {
                      value: 'DELIVERY',
                      label: priced.delivery.feeMinor ? 'Deliver' : 'Deliver (free)',
                      icon: <Truck />,
                    },
                  ]}
                />
              )}
              {f.fulfilment && <p className="text-sm text-danger">{f.fulfilment}</p>}
              {fulfilment === 'COLLECTION' ? (
                <p className="flex gap-2 rounded-xl bg-muted/70 p-4 text-sm">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span>
                    Collect from{' '}
                    <span className="font-medium">{priced.collection.address || 'our shop'}</span>.
                    We’ll message you when it’s ready.
                  </span>
                </p>
              ) : (
                <div className="grid gap-5 animate-slide-up sm:grid-cols-2">
                  <Field
                    label="Street or house"
                    error={f['address.line1']}
                    className="sm:col-span-2"
                  >
                    <Input
                      name="line1"
                      autoComplete="address-line1"
                      placeholder="e.g. Plot 12, Mosi-o-Tunya Road"
                      onChange={() => errors.clear('address.line1')}
                    />
                  </Field>
                  <Field label="Area" hint="Optional">
                    <Input name="area" autoComplete="address-level3" placeholder="e.g. Woodlands" />
                  </Field>
                  <Field label="Town or city" hint="Optional">
                    <Input name="city" autoComplete="address-level2" placeholder="e.g. Lusaka" />
                  </Field>
                  <Field
                    label="Directions for the driver"
                    hint="Optional"
                    className="sm:col-span-2"
                  >
                    <Input
                      name="addressNotes"
                      placeholder="e.g. Blue gate opposite the school"
                      maxLength={200}
                    />
                  </Field>
                </div>
              )}
            </div>
          </Step>

          <Step n={3} title="Review">
            <Field label="Notes for the shop" hint="Optional">
              <Textarea name="notes" rows={2} maxLength={500} className="min-h-16" />
            </Field>
          </Step>
        </div>

        <aside className="lg:sticky lg:top-24">
          <Card className="p-5 sm:p-6">
            <h2 className="text-base font-semibold">Order summary</h2>
            <div className="hidden lg:block">
              <CartLines lines={priced.lines} currency={priced.currency} compact />
            </div>
            <div className="mt-4 lg:mt-2">
              <Totals priced={priced} fee={fee} />
            </div>
            <Button
              type="submit"
              size="lg"
              className="mt-5 w-full"
              loading={pending}
              disabled={blocked}
            >
              <Lock /> Pay securely · <Money minor={total} currency={priced.currency} />
            </Button>
            {blocked && (
              <p className="mt-2 text-xs text-danger">
                Remove sold-out items from your cart to continue.
              </p>
            )}
            <p className="mt-3 text-center text-xs text-muted-foreground">
              You’ll pay on DevDraft’s secure page. Your items are reserved while you pay. See our{' '}
              <Link href="/privacy" className="underline">
                privacy notice
              </Link>
              .
            </p>
          </Card>
        </aside>
      </form>
    </div>
  );
}
