import { Worker } from 'node:worker_threads';
import { type DatabaseHandle, inventory, stockMovements } from '@snapsell/db';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  adjustStock,
  commitOrderSale,
  releaseOrder,
  reserveOrder,
  StockAdjustmentError,
} from '../src/catalog/inventory-ops.js';
import { ProductsService } from '../src/catalog/products.service.js';
import { DATABASE } from '../src/database/database.module.js';
import { createOrder } from './fixtures/catalog.js';
import { startTestApp, type TestApp } from './helpers.js';

let t: TestApp;
let h: DatabaseHandle;
let ownerId: string;

beforeEach(async () => {
  t = await startTestApp();
  h = t.app.get(DATABASE);
  ownerId = (h.sqlite.prepare('select id from users').get() as { id: string }).id;
});
afterEach(async () => {
  await t.close();
});

function makeVariant(stock: number) {
  const product = t.app.get(ProductsService).create(
    {
      name: 'Headphones',
      description: '',
      categoryId: null,
      status: 'ACTIVE',
      optionNames: [],
      variants: [
        {
          sku: '',
          optionValues: {},
          priceMinor: 35000,
          compareAtMinor: null,
          initialStock: stock,
          lowStockThreshold: 3,
        },
      ],
    },
    ownerId,
  );
  return product.variants[0]!.id;
}

const stock = (variantId: string) =>
  h.db
    .select({ onHand: inventory.onHand, reserved: inventory.reserved })
    .from(inventory)
    .where(eq(inventory.variantId, variantId))
    .get()!;

const movements = (orderId: string) =>
  h.db
    .select({ reason: stockMovements.reason })
    .from(stockMovements)
    .where(eq(stockMovements.orderId, orderId))
    .all()
    .map((m) => m.reason);

describe('adjustStock', () => {
  it('records initial stock as a movement', () => {
    const v = makeVariant(5);
    expect(stock(v)).toEqual({ onHand: 5, reserved: 0 });
    const m = h.db.select().from(stockMovements).where(eq(stockMovements.variantId, v)).all();
    expect(m).toMatchObject([{ deltaOnHand: 5, reason: 'MANUAL_ADJUST', note: 'Initial stock' }]);
  });

  it('never goes below what is reserved', () => {
    const v = makeVariant(5);
    reserveOrder(h.db, createOrder(h.db, [{ variantId: v, quantity: 3 }]));
    expect(() => adjustStock(h.db, { variantId: v, delta: -3, reason: 'CORRECTION' })).toThrow(
      StockAdjustmentError,
    );
    adjustStock(h.db, { variantId: v, delta: -2, reason: 'CORRECTION' });
    expect(stock(v)).toEqual({ onHand: 3, reserved: 3 });
  });
});

describe('order stock lifecycle', () => {
  it('reserves all lines or none', () => {
    const a = makeVariant(5);
    const b = makeVariant(1);
    const order = createOrder(h.db, [
      { variantId: a, quantity: 2 },
      { variantId: b, quantity: 2 },
    ]);
    expect(reserveOrder(h.db, order)).toEqual({
      ok: false,
      shortages: [{ variantId: b, requested: 2, available: 1 }],
    });
    expect(stock(a)).toEqual({ onHand: 5, reserved: 0 });
    expect(movements(order)).toEqual([]);
  });

  it('merges duplicate lines for the same variant', () => {
    const v = makeVariant(5);
    const order = createOrder(h.db, [
      { variantId: v, quantity: 2 },
      { variantId: v, quantity: 1 },
    ]);
    expect(reserveOrder(h.db, order).ok).toBe(true);
    expect(stock(v)).toEqual({ onHand: 5, reserved: 3 });
  });

  it('reserve → commit sale is idempotent at every step', () => {
    const v = makeVariant(5);
    const order = createOrder(h.db, [{ variantId: v, quantity: 2 }]);
    expect(reserveOrder(h.db, order)).toEqual({ ok: true, changed: true });
    expect(reserveOrder(h.db, order)).toEqual({ ok: true, changed: false });
    expect(stock(v)).toEqual({ onHand: 5, reserved: 2 });

    expect(commitOrderSale(h.db, order)).toEqual({ ok: true, changed: true });
    expect(commitOrderSale(h.db, order)).toEqual({ ok: true, changed: false });
    expect(stock(v)).toEqual({ onHand: 3, reserved: 0 });

    // A sold order has nothing left to release.
    expect(releaseOrder(h.db, order)).toEqual({ ok: true, changed: false });
    expect(stock(v)).toEqual({ onHand: 3, reserved: 0 });
    expect(movements(order).sort()).toEqual(['RESERVE', 'SALE']);
  });

  it('reserve → release is idempotent and frees the stock', () => {
    const v = makeVariant(5);
    const order = createOrder(h.db, [{ variantId: v, quantity: 4 }]);
    reserveOrder(h.db, order);
    expect(releaseOrder(h.db, order)).toEqual({ ok: true, changed: true });
    expect(releaseOrder(h.db, order)).toEqual({ ok: true, changed: false });
    expect(stock(v)).toEqual({ onHand: 5, reserved: 0 });
  });

  it('a late payment after release takes stock from what is available', () => {
    const v = makeVariant(3);
    const order = createOrder(h.db, [{ variantId: v, quantity: 2 }]);
    reserveOrder(h.db, order);
    releaseOrder(h.db, order);
    expect(commitOrderSale(h.db, order)).toEqual({ ok: true, changed: true });
    expect(stock(v)).toEqual({ onHand: 1, reserved: 0 });
  });

  it('a late payment reports a shortage when the stock is gone', () => {
    const v = makeVariant(2);
    const late = createOrder(h.db, [{ variantId: v, quantity: 2 }]);
    reserveOrder(h.db, late);
    releaseOrder(h.db, late);
    reserveOrder(h.db, createOrder(h.db, [{ variantId: v, quantity: 2 }]));
    expect(commitOrderSale(h.db, late)).toEqual({
      ok: false,
      shortages: [{ variantId: v, requested: 2, available: 0 }],
    });
    expect(stock(v)).toEqual({ onHand: 2, reserved: 2 });
  });
});

describe('concurrency', () => {
  it('50 reservations from 5 connections at once: exactly 10 succeed for 10 in stock', async () => {
    const v = makeVariant(10);
    const orderIds = Array.from({ length: 50 }, () =>
      createOrder(h.db, [{ variantId: v, quantity: 1 }]),
    );
    const file = t.config.paths.database;
    const chunks = Array.from({ length: 5 }, (_, i) => orderIds.filter((_, j) => j % 5 === i));

    const results = await Promise.all(
      chunks.map(
        (ids) =>
          new Promise<boolean[]>((resolve, reject) => {
            const worker = new Worker(new URL('./fixtures/reserve-worker.ts', import.meta.url), {
              workerData: { file, orderIds: ids },
              execArgv: ['--import', 'tsx'],
            });
            worker.once('message', resolve);
            worker.once('error', reject);
          }),
      ),
    );

    expect(results.flat().filter(Boolean)).toHaveLength(10);
    expect(stock(v)).toEqual({ onHand: 10, reserved: 10 });
    const reserves = h.db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.reason, 'RESERVE'))
      .all();
    expect(reserves).toHaveLength(10);
  });
});
