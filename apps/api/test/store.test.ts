import { randomUUID } from 'node:crypto';
import { type DatabaseHandle, inventory, orders } from '@snapsell/db';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DATABASE } from '../src/database/database.module.js';
import { OrdersService } from '../src/orders/orders.service.js';
import { signIn, startTestApp, type TestApp } from './helpers.js';

let t: TestApp;
let admin: Awaited<ReturnType<typeof signIn>>;
let h: DatabaseHandle;

beforeEach(async () => {
  t = await startTestApp();
  admin = await signIn(t);
  h = t.app.get(DATABASE);
});
afterEach(async () => {
  await t.close();
});

const aPost = (path: string, body: object) =>
  admin.agent.post(`/api/admin${path}`).set('x-csrf-token', admin.csrf).send(body);
const pub = () => t.http();

async function product(name: string, priceMinor: number, stock: number, extra: object = {}) {
  return (
    await aPost('/products', {
      name,
      variants: [{ priceMinor, initialStock: stock, lowStockThreshold: 3 }],
      ...extra,
    }).expect(201)
  ).body as {
    id: string;
    slug: string;
    variants: Array<{ id: string }>;
  };
}

async function setShop(patch: object) {
  await admin.agent
    .put('/api/admin/settings/shop')
    .set('x-csrf-token', admin.csrf)
    .send({
      name: 'Test Shop',
      address: 'Cairo Road',
      deliveryEnabled: true,
      deliveryFeeMinor: 5000,
      collectionEnabled: true,
      reservationTtlMinutes: 60,
      ...patch,
    })
    .expect(200);
}

const checkout = (over: object) => ({
  checkoutKey: randomUUID(),
  fullName: 'Mwila Banda',
  phone: '097 123 4567',
  fulfilment: 'COLLECTION',
  ...over,
});

const stock = (variantId: string) =>
  h.db.select().from(inventory).where(eq(inventory.variantId, variantId)).get()!;

describe('public catalogue', () => {
  it('shows active and unavailable products only, with stock as a band', async () => {
    const shown = await product('Basket', 18000, 10);
    const low = await product('Lamp', 9000, 2);
    const hidden = await product('Secret', 100, 5, { status: 'INACTIVE' });
    await product('Sold out', 100, 0, { status: 'UNAVAILABLE' });

    const list = (await pub().get('/api/store/products').expect(200)).body;
    expect(list.items.map((i: { name: string }) => i.name).sort()).toEqual([
      'Basket',
      'Lamp',
      'Sold out',
    ]);
    const byName = Object.fromEntries(list.items.map((i: { name: string }) => [i.name, i]));
    expect(byName.Basket.availability).toEqual({ state: 'in_stock' });
    expect(byName.Lamp.availability).toEqual({ state: 'low', left: 2 });
    expect(byName['Sold out']).toMatchObject({
      orderable: false,
      availability: { state: 'sold_out' },
    });

    const detail = (await pub().get(`/api/store/products/${shown.slug}`).expect(200)).body;
    expect(detail.variants[0]).toMatchObject({
      priceMinor: 18000,
      availability: { state: 'in_stock' },
      maxQuantity: 10,
    });
    expect(JSON.stringify(detail)).not.toContain('onHand');
    await pub().get(`/api/store/products/${hidden.slug}`).expect(404);
    expect(low).toBeDefined();
  });
});

describe('cart pricing', () => {
  it('prices from the database and flags lines that changed', async () => {
    const a = await product('Mug', 7500, 5);
    const b = await product('Bowl', 5000, 1);
    const gone = await product('Plate', 3000, 0);
    const cart = (
      await pub()
        .post('/api/store/cart/price')
        .send({
          items: [
            { variantId: a.variants[0]!.id, quantity: 2 },
            { variantId: a.variants[0]!.id, quantity: 1 },
            { variantId: b.variants[0]!.id, quantity: 3 },
            { variantId: gone.variants[0]!.id, quantity: 1 },
            { variantId: 'nope', quantity: 1 },
          ],
        })
        .expect(200)
    ).body;
    expect(
      cart.lines.map(
        (l: { productName: string; quantity: number; status: string; lineTotalMinor: number }) => [
          l.productName,
          l.quantity,
          l.status,
          l.lineTotalMinor,
        ],
      ),
    ).toEqual([
      ['Mug', 3, 'ok', 22500],
      ['Bowl', 1, 'reduced', 5000],
      ['Plate', 1, 'unavailable', 0],
    ]);
    expect(cart.subtotalMinor).toBe(27500);
  });
});

describe('checkout', () => {
  it('creates an order from trusted prices, reserves stock and upserts the customer by phone', async () => {
    await setShop({});
    const p = await product('Headphones', 35000, 5);
    const v = p.variants[0]!.id;

    // A tampered price in the body is ignored (unknown fields are stripped) and the total is checked.
    const tampered = await pub()
      .post('/api/store/checkout')
      .send(
        checkout({
          items: [{ variantId: v, quantity: 2, priceMinor: 1 }],
          fulfilment: 'DELIVERY',
          address: { line1: 'Plot 12, Woodlands' },
          expectedTotalMinor: 2,
        }),
      )
      .expect(409);
    expect(tampered.body.error.code).toBe('PRICE_CHANGED');
    expect(tampered.body.error.details.subtotalMinor).toBe(70000);

    const body = checkout({
      items: [{ variantId: v, quantity: 2 }],
      fulfilment: 'DELIVERY',
      address: { line1: 'Plot 12, Woodlands', city: 'Lusaka' },
      expectedTotalMinor: 75000,
    });
    const res = (await pub().post('/api/store/checkout').send(body).expect(201)).body;
    expect(res.ref).toBe('ORD-00001');
    expect(stock(v)).toMatchObject({ onHand: 5, reserved: 2 });

    // Retrying the same checkout returns the same order and reserves nothing more.
    expect((await pub().post('/api/store/checkout').send(body).expect(201)).body.ref).toBe(
      'ORD-00001',
    );
    expect(stock(v).reserved).toBe(2);

    const order = (await pub().get(`/api/store/orders/${res.ref}?t=${res.statusToken}`).expect(200))
      .body;
    expect(order).toMatchObject({
      status: 'PENDING_PAYMENT',
      paymentStatus: 'LINK_CREATED',
      fulfilmentMethod: 'DELIVERY',
      customerFirstName: 'Mwila',
      subtotalMinor: 70000,
      deliveryFeeMinor: 5000,
      totalMinor: 75000,
      lines: [{ name: 'Headphones', quantity: 2, lineTotalMinor: 70000 }],
    });
    await pub().get(`/api/store/orders/${res.ref}?t=wrong-token`).expect(404);

    // Same phone in another format → same customer.
    await pub()
      .post('/api/store/checkout')
      .send(
        checkout({
          items: [{ variantId: v, quantity: 1 }],
          phone: '+260971234567',
          fullName: 'Mwila B.',
          expectedTotalMinor: 35000,
        }),
      )
      .expect(201);
    const customers = h.sqlite.prepare('select full_name, phone_e164 from customers').all();
    expect(customers).toEqual([{ full_name: 'Mwila B.', phone_e164: '+260971234567' }]);
  });

  it('refuses when stock ran out, and validates the details', async () => {
    const p = await product('Speaker', 48000, 1);
    const v = p.variants[0]!.id;
    const out = await pub()
      .post('/api/store/checkout')
      .send(checkout({ items: [{ variantId: v, quantity: 2 }], expectedTotalMinor: 96000 }))
      .expect(409);
    expect(out.body.error).toMatchObject({
      code: 'CART_CHANGED',
      details: { lines: [{ status: 'reduced', quantity: 1 }] },
    });
    expect(h.sqlite.prepare('select count(*) as n from orders').get()).toEqual({ n: 0 });

    const bad = await pub()
      .post('/api/store/checkout')
      .send(
        checkout({
          items: [{ variantId: v, quantity: 1 }],
          phone: '12',
          fulfilment: 'DELIVERY',
          expectedTotalMinor: 48000,
        }),
      )
      .expect(400);
    expect(bad.body.error.fields).toMatchObject({
      phone: expect.any(String),
      'address.line1': 'Enter the street or house',
    });
  });

  it('respects the shop’s delivery settings', async () => {
    await setShop({ deliveryEnabled: false });
    const p = await product('Rug', 20000, 3);
    const res = await pub()
      .post('/api/store/checkout')
      .send(
        checkout({
          items: [{ variantId: p.variants[0]!.id, quantity: 1 }],
          fulfilment: 'DELIVERY',
          address: { line1: 'Plot 1' },
          expectedTotalMinor: 20000,
        }),
      )
      .expect(400);
    expect(res.body.error.fields.fulfilment).toBeDefined();
  });

  it('releases the stock of unpaid orders when the reservation expires', async () => {
    const p = await product('Vase', 12000, 2);
    const v = p.variants[0]!.id;
    const { ref } = (
      await pub()
        .post('/api/store/checkout')
        .send(checkout({ items: [{ variantId: v, quantity: 2 }], expectedTotalMinor: 24000 }))
        .expect(201)
    ).body;
    expect(stock(v).reserved).toBe(2);

    const svc = t.app.get(OrdersService);
    expect(svc.expireUnpaid(new Date())).toBe(0);
    expect(svc.expireUnpaid(new Date(Date.now() + 61 * 60_000))).toBe(1);
    expect(stock(v).reserved).toBe(0);
    expect(h.db.select({ s: orders.status }).from(orders).where(eq(orders.ref, ref)).get()).toEqual(
      { s: 'EXPIRED' },
    );
  });
});
