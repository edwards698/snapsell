import { randomUUID } from 'node:crypto';
import { type DatabaseHandle, inventory, orders, webhookEvents } from '@snapsell/db';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DATABASE } from '../src/database/database.module.js';
import { OrdersService } from '../src/orders/orders.service.js';
import { signBody } from '../src/payments/devdraft.provider.js';
import { type FakePaymentProvider } from '../src/payments/fake.provider.js';
import { PAYMENT_PROVIDER } from '../src/payments/payment.provider.js';
import { signIn, startTestApp, type TestApp } from './helpers.js';

let t: TestApp;
let admin: Awaited<ReturnType<typeof signIn>>;
let h: DatabaseHandle;
let fake: FakePaymentProvider;
let secret: string;

beforeEach(async () => {
  t = await startTestApp();
  admin = await signIn(t);
  h = t.app.get(DATABASE);
  fake = t.app.get(PAYMENT_PROVIDER);
  secret = t.config.devdraft.webhookSecret;
});
afterEach(async () => {
  await t.close();
});

const aPost = (path: string, body: object = {}) =>
  admin.agent.post(`/api/admin${path}`).set('x-csrf-token', admin.csrf).send(body);
const aGet = (path: string) => admin.agent.get(`/api/admin${path}`);

async function placeOrder(
  opts: {
    stock?: number;
    quantity?: number;
    fulfilment?: 'COLLECTION' | 'DELIVERY';
    phone?: string;
  } = {},
) {
  const product = (
    await aPost('/products', {
      name: `Item ${randomUUID().slice(0, 6)}`,
      variants: [{ priceMinor: 25000, initialStock: opts.stock ?? 5 }],
    }).expect(201)
  ).body;
  const variantId = product.variants[0].id as string;
  const quantity = opts.quantity ?? 2;
  const res = (
    await t
      .http()
      .post('/api/store/checkout')
      .send({
        checkoutKey: randomUUID(),
        items: [{ variantId, quantity }],
        fullName: 'Mwila Banda',
        phone: opts.phone ?? '0971234567',
        fulfilment: opts.fulfilment ?? 'COLLECTION',
        ...(opts.fulfilment === 'DELIVERY' ? { address: { line1: 'Plot 12, Woodlands' } } : {}),
        expectedTotalMinor: 25000 * quantity,
      })
      .expect(201)
  ).body as { ref: string; statusToken: string; paymentUrl: string | null };
  const linkId = res.paymentUrl?.split('/').pop() ?? null;
  return { ...res, variantId, linkId };
}

const order = (ref: string) => h.db.select().from(orders).where(eq(orders.ref, ref)).get()!;
const stock = (variantId: string) =>
  h.db
    .select({ onHand: inventory.onHand, reserved: inventory.reserved })
    .from(inventory)
    .where(eq(inventory.variantId, variantId))
    .get()!;

function deliver(body: string, sig = signBody(secret, body)) {
  return t
    .http()
    .post('/api/webhooks/devdraft')
    .set('content-type', 'application/json')
    .set('x-webhook-signature', sig)
    .send(body);
}

describe('checkout → payment link', () => {
  it('returns a payment link with the order, and reuses it', async () => {
    const o = await placeOrder();
    expect(o.paymentUrl).toMatch(/^http:\/\/localhost:3000\/pay\/test\/[0-9a-f-]{36}$/);
    expect(order(o.ref).paymentStatus).toBe('LINK_CREATED');

    const again = (await aPost(`/orders/${o.ref}/payment-link`).expect(200)).body;
    expect(again.payments).toHaveLength(1);
    const pub = (await t.http().get(`/api/store/orders/${o.ref}?t=${o.statusToken}`).expect(200))
      .body;
    expect(pub.paymentUrl).toBe(o.paymentUrl);
  });
});

describe('webhooks', () => {
  it('marks the order paid once, commits the stock and emails the owner', async () => {
    const o = await placeOrder({ quantity: 2, stock: 5 });
    expect(stock(o.variantId)).toEqual({ onHand: 5, reserved: 2 });
    const body = fake.eventBody(o.linkId!, 'completed')!;

    // Five concurrent deliveries of the same event.
    const results = await Promise.all(Array.from({ length: 5 }, () => deliver(body)));
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    expect(results.filter((r) => r.body.duplicate).length).toBe(4);
    await t.worker.drain();

    expect(order(o.ref)).toMatchObject({
      paymentStatus: 'PAID',
      status: 'CONFIRMED',
      fulfilmentStatus: 'PROCESSING',
      needsAttention: false,
    });
    expect(stock(o.variantId)).toEqual({ onHand: 3, reserved: 0 });
    expect(t.emails.sent.filter((e) => e.subject.startsWith(`${o.ref} paid`))).toHaveLength(1);

    // A second, different event for the same payment changes nothing.
    await deliver(fake.eventBody(o.linkId!, 'completed')!).expect(200);
    await t.worker.drain();
    expect(stock(o.variantId)).toEqual({ onHand: 3, reserved: 0 });
    const events = h.db.select().from(webhookEvents).all();
    expect(events.map((e) => e.outcome).sort()).toEqual(['Marked paid', 'Order was already paid']);
  });

  it('rejects bad signatures and records them', async () => {
    const o = await placeOrder();
    const body = fake.eventBody(o.linkId!, 'completed')!;
    await deliver(body, signBody('not-the-secret', body)).expect(401);
    await deliver(body, '').expect(401);
    await t.worker.drain();
    expect(order(o.ref).paymentStatus).toBe('LINK_CREATED');
    expect(h.db.select().from(webhookEvents).all()).toMatchObject([
      { signatureValid: false, status: 'IGNORED' },
    ]);
  });

  it('ignores a payment whose amount doesn’t match, and flags the order', async () => {
    const o = await placeOrder();
    const body = JSON.parse(fake.eventBody(o.linkId!, 'completed')!);
    body.data.amount = 1;
    await deliver(JSON.stringify(body)).expect(200);
    await t.worker.drain();
    expect(order(o.ref)).toMatchObject({ paymentStatus: 'LINK_CREATED', needsAttention: true });
    expect(h.db.select().from(webhookEvents).get()!.outcome).toMatch(/doesn’t match/);
  });

  it('records a failed payment and keeps the reservation', async () => {
    const o = await placeOrder();
    await deliver(fake.eventBody(o.linkId!, 'failed')!).expect(200);
    await t.worker.drain();
    expect(order(o.ref).paymentStatus).toBe('FAILED');
    expect(stock(o.variantId).reserved).toBe(2);
  });

  it('accepts a late payment after the reservation expired, or flags a shortage', async () => {
    const ok = await placeOrder({ stock: 5, quantity: 2 });
    const short = await placeOrder({ stock: 2, quantity: 2 });
    t.app.get(OrdersService).expireUnpaid(new Date(Date.now() + 2 * 60 * 60_000));
    expect(order(ok.ref).status).toBe('EXPIRED');
    // Someone else buys the second product's stock meanwhile.
    await t
      .http()
      .post('/api/store/checkout')
      .send({
        checkoutKey: randomUUID(),
        items: [{ variantId: short.variantId, quantity: 2 }],
        fullName: 'Other',
        phone: '0977000000',
        fulfilment: 'COLLECTION',
        expectedTotalMinor: 50000,
      })
      .expect(201);

    await deliver(fake.eventBody(ok.linkId!, 'completed')!).expect(200);
    await deliver(fake.eventBody(short.linkId!, 'completed')!).expect(200);
    await t.worker.drain();
    expect(order(ok.ref)).toMatchObject({
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
      needsAttention: false,
    });
    expect(stock(ok.variantId)).toEqual({ onHand: 3, reserved: 0 });
    expect(order(short.ref)).toMatchObject({ paymentStatus: 'PAID', needsAttention: true });
    const stats = (await aGet('/orders/stats').expect(200)).body;
    expect(stats.attention.map((a: { ref: string }) => a.ref)).toContain(short.ref);
  });

  it('ignores events for unknown links and non-payment events', async () => {
    await deliver(
      JSON.stringify({ id: 'evt_1', type: 'payment.completed', data: { paymentLinkId: 'nope' } }),
    ).expect(200);
    await deliver(JSON.stringify({ id: 'evt_2', type: 'invoice.created', data: {} })).expect(200);
    await t.worker.drain();
    expect(
      h.db
        .select({ o: webhookEvents.outcome })
        .from(webhookEvents)
        .all()
        .map((r) => r.o)
        .sort(),
    ).toEqual(['No payment link matches this event', 'Not a payment event (invoice.created)']);
  });

  it('reconciles a payment whose webhook never arrived', async () => {
    const o = await placeOrder();
    fake.links.get(o.linkId!)!.status = 'paid';
    const res = (await aPost(`/orders/${o.ref}/check-payment`).expect(200)).body;
    expect(res.result).toBe('paid');
    expect(res.order).toMatchObject({ paymentStatus: 'PAID', status: 'CONFIRMED' });
  });

  it('test-mode endpoints simulate a payment end to end', async () => {
    const o = await placeOrder();
    const info = (await t.http().get(`/api/test-payments/${o.linkId}`).expect(200)).body;
    expect(info).toMatchObject({ orderRef: o.ref, amountMinor: 50000, status: 'pending' });
    await t.http().post(`/api/test-payments/${o.linkId}/completed`).expect(200);
    await t.worker.drain();
    expect(order(o.ref).paymentStatus).toBe('PAID');
  });
});

describe('admin orders', () => {
  async function pay(o: { linkId: string | null }) {
    await deliver(fake.eventBody(o.linkId!, 'completed')!).expect(200);
    await t.worker.drain();
  }

  it('lists, searches and filters', async () => {
    const a = await placeOrder({ phone: '0961111111' });
    const b = await placeOrder({ phone: '0972222222' });
    await pay(b);
    expect((await aGet('/orders').expect(200)).body.total).toBe(2);
    expect(
      (await aGet('/orders?view=unpaid').expect(200)).body.items.map((i: { ref: string }) => i.ref),
    ).toEqual([a.ref]);
    expect(
      (await aGet('/orders?view=to_fulfil').expect(200)).body.items.map(
        (i: { ref: string }) => i.ref,
      ),
    ).toEqual([b.ref]);
    expect(
      (await aGet('/orders?q=096 111').expect(200)).body.items.map((i: { ref: string }) => i.ref),
    ).toEqual([a.ref]);
    expect((await aGet(`/orders?q=${b.ref}`).expect(200)).body.total).toBe(1);

    const customers = (await aGet('/customers').expect(200)).body;
    expect(
      customers.items.find((c: { phone: string }) => c.phone.includes('97 222')),
    ).toMatchObject({ orderCount: 1, paidTotalMinor: 50000 });
  });

  it('moves a paid collection order through fulfilment to completed', async () => {
    const o = await placeOrder();
    expect(
      (await aPost(`/orders/${o.ref}/fulfilment`, { status: 'PROCESSING' }).expect(409)).body.error
        .message,
    ).toMatch(/paid/);
    await pay(o);
    let detail = (await aGet(`/orders/${o.ref}`).expect(200)).body;
    expect(detail.nextSteps).toEqual(['READY_FOR_COLLECTION']);
    await aPost(`/orders/${o.ref}/fulfilment`, { status: 'DISPATCHED' }).expect(409);
    await aPost(`/orders/${o.ref}/fulfilment`, { status: 'READY_FOR_COLLECTION' }).expect(200);
    detail = (await aPost(`/orders/${o.ref}/fulfilment`, { status: 'DELIVERED' }).expect(200)).body;
    expect(detail).toMatchObject({
      status: 'COMPLETED',
      fulfilmentStatus: 'DELIVERED',
      nextSteps: [],
    });
    expect(detail.timeline.map((e: { label: string }) => e.label)).toEqual([
      'Order placed',
      'Payment link created',
      'Payment verified',
      'Fulfilment updated',
      'Fulfilment updated',
    ]);
    expect(detail.webhookEvents).toHaveLength(1);
  });

  it('cancels: unpaid orders release stock; paid ones need a reason and can restock', async () => {
    const unpaid = await placeOrder({ stock: 5, quantity: 2 });
    await aPost(`/orders/${unpaid.ref}/cancel`).expect(200);
    expect(stock(unpaid.variantId)).toEqual({ onHand: 5, reserved: 0 });
    expect(order(unpaid.ref).status).toBe('CANCELLED');

    const paid = await placeOrder({ stock: 5, quantity: 2 });
    await pay(paid);
    expect(
      (await aPost(`/orders/${paid.ref}/cancel`, {}).expect(400)).body.error.fields.reason,
    ).toBeDefined();
    await aPost(`/orders/${paid.ref}/cancel`, {
      reason: 'Customer changed mind',
      restock: true,
      refunded: true,
    }).expect(200);
    expect(order(paid.ref)).toMatchObject({ status: 'CANCELLED', paymentStatus: 'REFUNDED' });
    expect(stock(paid.variantId)).toEqual({ onHand: 5, reserved: 0 });
  });
});

describe('currency support', () => {
  it('keeps the order but flags it when DevDraft can’t take the shop currency', async () => {
    await t.close();
    t = await startTestApp({
      DEVDRAFT_MODE: 'sandbox',
      DEVDRAFT_CLIENT_KEY: 'k',
      DEVDRAFT_CLIENT_SECRET: 's',
      DEVDRAFT_WEBHOOK_SECRET: 'w'.repeat(32),
    });
    admin = await signIn(t);
    h = t.app.get(DATABASE);
    const o = await placeOrder();
    expect(o.paymentUrl).toBeNull();
    expect(order(o.ref)).toMatchObject({ status: 'PENDING_PAYMENT', needsAttention: true });
    const detail = (await aGet(`/orders/${o.ref}`).expect(200)).body;
    expect(detail.timeline.at(-1)).toMatchObject({
      label: 'Payment link failed',
      detail: expect.stringMatching(/doesn’t accept ZMW/),
    });
  });
});
