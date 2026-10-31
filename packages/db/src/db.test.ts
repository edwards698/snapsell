import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  categories,
  type DatabaseHandle,
  inventory,
  newId,
  openDatabase,
  products,
  productVariants,
  runMigrations,
} from './index.js';

let h: DatabaseHandle;

beforeEach(() => {
  h = openDatabase(':memory:');
  runMigrations(h);
});
afterEach(() => h.close());

function search(term: string) {
  return h.sqlite
    .prepare(`select product_id from products_fts where products_fts match ? order by rank`)
    .all(term) as Array<{ product_id: string }>;
}

describe('migrations', () => {
  it('seeds singleton settings rows', () => {
    const row = h.sqlite.prepare('select currency, timezone from business_settings').get();
    expect(row).toEqual({ currency: 'ZMW', timezone: 'Africa/Lusaka' });
  });

  it('enforces enum and stock CHECK constraints', () => {
    const pid = newId();
    h.db.insert(products).values({ id: pid, name: 'Hat', slug: 'hat' }).run();
    expect(() =>
      h.sqlite.prepare(`update products set status = 'NOPE' where id = ?`).run(pid),
    ).toThrow(/CHECK constraint failed/);

    const vid = newId();
    h.db
      .insert(productVariants)
      .values({ id: vid, productId: pid, sku: 'HAT-1', priceMinor: 100, currency: 'ZMW' })
      .run();
    h.db.insert(inventory).values({ variantId: vid, onHand: 2 }).run();
    expect(() =>
      h.db.update(inventory).set({ reserved: 3 }).where(eq(inventory.variantId, vid)).run(),
    ).toThrow(/CHECK constraint failed/);
  });
});

describe('product search index', () => {
  it('tracks products, SKUs and category names', () => {
    const cid = newId();
    h.db.insert(categories).values({ id: cid, name: 'Audio', slug: 'audio' }).run();
    const pid = newId();
    h.db
      .insert(products)
      .values({
        id: pid,
        name: 'Wireless Headphones',
        slug: 'wh',
        description: 'Bluetooth, over-ear',
        categoryId: cid,
      })
      .run();
    h.db
      .insert(productVariants)
      .values({ id: newId(), productId: pid, sku: 'WH-BLK', priceMinor: 35000, currency: 'ZMW' })
      .run();

    expect(search('headph*')).toEqual([{ product_id: pid }]);
    expect(search('bluetooth')).toEqual([{ product_id: pid }]);
    expect(search('"WH-BLK"')).toEqual([{ product_id: pid }]);
    expect(search('audio')).toEqual([{ product_id: pid }]);

    h.db.update(categories).set({ name: 'Sound' }).where(eq(categories.id, cid)).run();
    expect(search('audio')).toEqual([]);
    expect(search('sound')).toEqual([{ product_id: pid }]);

    h.db.update(products).set({ name: 'Studio Cans' }).where(eq(products.id, pid)).run();
    expect(search('headph*')).toEqual([]);
    expect(search('studio')).toEqual([{ product_id: pid }]);

    h.db.delete(products).where(eq(products.id, pid)).run();
    expect(h.db.get(sql`select count(*) as n from products_fts`)).toEqual({ n: 0 });
  });
});

describe('newId', () => {
  it('is 20 url-safe characters and unique', () => {
    const ids = new Set(Array.from({ length: 1000 }, newId));
    expect(ids.size).toBe(1000);
    for (const id of ids) expect(id).toMatch(/^[0-9a-z]{20}$/);
  });
});
