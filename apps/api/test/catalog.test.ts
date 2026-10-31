import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_PROVIDER, type AiProvider } from '../src/ai/ai.provider.js';
import { commitOrderSale, reserveOrder } from '../src/catalog/inventory-ops.js';
import { DATABASE } from '../src/database/database.module.js';
import { createOrder } from './fixtures/catalog.js';
import { signIn, startTestApp, type TestApp } from './helpers.js';

let t: TestApp;
let agent: Awaited<ReturnType<typeof signIn>>['agent'];
let csrf: string;

beforeEach(async () => {
  t = await startTestApp({ GEMINI_API_KEY: 'test-key' });
  ({ agent, csrf } = await signIn(t));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await t.close();
});

const post = (path: string, body?: object) =>
  agent
    .post(`/api/admin${path}`)
    .set('x-csrf-token', csrf)
    .send(body ?? {});
const put = (path: string, body: object) =>
  agent.put(`/api/admin${path}`).set('x-csrf-token', csrf).send(body);
const del = (path: string) => agent.delete(`/api/admin${path}`).set('x-csrf-token', csrf);
const get = (path: string) => agent.get(`/api/admin${path}`);

const simple = (name: string, extra: object = {}) => ({
  name,
  variants: [{ priceMinor: 6000, initialStock: 5 }],
  ...extra,
});

async function jpeg(width: number, height: number, exif = false) {
  let img = sharp({
    create: { width, height, channels: 3, background: { r: 16, g: 185, b: 129 } },
  }).jpeg();
  if (exif)
    img = img.withMetadata({
      orientation: 6,
      exif: {
        IFD0: { Make: 'TestCam' },
        IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '15/1 25/1 0/1' },
      },
    });
  return img.toBuffer();
}

describe('categories', () => {
  it('creates, renames, reorders, archives and deletes', async () => {
    const a = (await post('/categories', { name: 'Audio' }).expect(201)).body;
    const b = (await post('/categories', { name: 'Fabric' }).expect(201)).body;
    expect(a).toMatchObject({ slug: 'audio', productCount: 0, archived: false });

    const dup = await post('/categories', { name: 'audio' }).expect(409);
    expect(dup.body.error.fields.name).toBeDefined();

    await agent
      .patch(`/api/admin/categories/${a.id}`)
      .set('x-csrf-token', csrf)
      .send({ name: 'Sound' })
      .expect(200);
    const ordered = (await put('/categories/order', { ids: [b.id, a.id] }).expect(200)).body;
    expect(ordered.map((c: { name: string }) => c.name)).toEqual(['Fabric', 'Sound']);

    await post('/products', simple('Speaker', { categoryId: a.id })).expect(201);
    expect((await del(`/categories/${a.id}`).expect(409)).body.error.code).toBe('CATEGORY_IN_USE');
    const archived = (await post(`/categories/${a.id}/archive`).expect(200)).body;
    expect(archived).toMatchObject({ archived: true, productCount: 1 });
    // Archived categories can't take new products.
    await post('/products', simple('Radio', { categoryId: a.id })).expect(400);

    await del(`/categories/${b.id}`).expect(204);
  });
});

describe('products', () => {
  it('creates a simple product with a generated SKU, unique slug and initial stock', async () => {
    const p = (await post('/products', simple('Blue Chitenge')).expect(201)).body;
    expect(p).toMatchObject({
      slug: 'blue-chitenge',
      status: 'ACTIVE',
      currency: 'ZMW',
      optionNames: [],
    });
    expect(p.variants).toHaveLength(1);
    expect(p.variants[0]).toMatchObject({
      label: 'Default',
      priceMinor: 6000,
      onHand: 5,
      available: 5,
      state: 'ok',
      isDefault: true,
    });
    expect(p.variants[0].sku).toMatch(/^BLUCHI-[A-Z2-9]{4}$/);

    const again = (await post('/products', simple('Blue chitenge')).expect(201)).body;
    expect(again.slug).toBe('blue-chitenge-2');
  });

  it('creates variants from options and validates them', async () => {
    const p = (
      await post('/products', {
        name: 'T-shirt',
        optionNames: ['Size'],
        variants: [
          { optionValues: { Size: 'M' }, priceMinor: 15000, initialStock: 2, sku: 'tee-m' },
          { optionValues: { Size: 'L' }, priceMinor: 16000, compareAtMinor: 20000 },
        ],
      }).expect(201)
    ).body;
    expect(p.variants.map((v: { label: string; sku: string }) => [v.label, v.sku])).toEqual([
      ['M', 'TEE-M'],
      ['L', expect.stringMatching(/^TSHI-[A-Z2-9]{4}$/)],
    ]);

    const bad = await post('/products', {
      name: 'Hat',
      variants: [{ priceMinor: 1000, compareAtMinor: 900 }],
    }).expect(400);
    expect(bad.body.error.fields).toEqual({
      'variants.0.compareAtMinor': 'Must be higher than the price',
    });

    const clash = await post('/products', {
      name: 'Other',
      variants: [{ priceMinor: 1, sku: 'TEE-M' }],
    }).expect(400);
    expect(clash.body.error.fields['variants.0.sku']).toMatch(/already uses/);
  });

  it('updates fields and variants, but won’t remove a variant that has orders', async () => {
    const created = (
      await post('/products', {
        name: 'Shoes',
        optionNames: ['Size'],
        variants: [
          { optionValues: { Size: '40' }, priceMinor: 30000, initialStock: 3 },
          { optionValues: { Size: '41' }, priceMinor: 30000, initialStock: 3 },
        ],
      }).expect(201)
    ).body;
    const [v40, v41] = created.variants;
    const updated = (
      await put(`/products/${created.id}`, {
        name: 'Leather shoes',
        description: 'Handmade',
        optionNames: ['Size'],
        variants: [
          { id: v40.id, optionValues: { Size: '40' }, priceMinor: 32000, lowStockThreshold: 1 },
          { optionValues: { Size: '42' }, priceMinor: 32000, initialStock: 4 },
        ],
      }).expect(200)
    ).body;
    expect(updated).toMatchObject({
      name: 'Leather shoes',
      slug: 'shoes',
      description: 'Handmade',
    });
    expect(
      updated.variants.map((v: { label: string; priceMinor: number; onHand: number }) => [
        v.label,
        v.priceMinor,
        v.onHand,
      ]),
    ).toEqual([
      ['40', 32000, 3],
      ['42', 32000, 4],
    ]);
    expect(updated.variants.find((v: { id: string }) => v.id === v41.id)).toBeUndefined();

    createOrder(t.app.get(DATABASE).db, [{ variantId: v40.id, quantity: 1 }]);
    const blocked = await put(`/products/${created.id}`, {
      name: 'Leather shoes',
      optionNames: ['Size'],
      variants: [{ id: updated.variants[1].id, optionValues: { Size: '42' }, priceMinor: 32000 }],
    }).expect(409);
    expect(blocked.body.error.code).toBe('VARIANT_HAS_ORDERS');
  });

  it('archives, restores (as hidden) and deletes only when never ordered', async () => {
    const p = (await post('/products', simple('Mug')).expect(201)).body;
    expect((await post(`/products/${p.id}/archive`).expect(200)).body.status).toBe('ARCHIVED');
    await put(`/products/${p.id}`, simple('Mug')).expect(409);
    expect((await post(`/products/${p.id}/restore`).expect(200)).body.status).toBe('INACTIVE');

    const sold = (await post('/products', simple('Cup')).expect(201)).body;
    createOrder(t.app.get(DATABASE).db, [{ variantId: sold.variants[0].id, quantity: 1 }]);
    expect((await del(`/products/${sold.id}`).expect(409)).body.error.code).toBe(
      'PRODUCT_HAS_ORDERS',
    );

    await del(`/products/${p.id}`).expect(204);
    await get(`/products/${p.id}`).expect(404);
  });

  it('lists with search, filters, sorting and pagination', async () => {
    const cat = (await post('/categories', { name: 'Audio' }).expect(201)).body;
    await post(
      '/products',
      simple('Wireless Headphones', {
        categoryId: cat.id,
        variants: [{ priceMinor: 35000, initialStock: 20 }],
      }),
    ).expect(201);
    await post(
      '/products',
      simple('Bluetooth Speaker', {
        categoryId: cat.id,
        variants: [{ priceMinor: 50000, initialStock: 2 }],
      }),
    ).expect(201);
    await post(
      '/products',
      simple('Kitenge Dress', { variants: [{ priceMinor: 20000, initialStock: 0 }] }),
    ).expect(201);
    const hidden = (await post('/products', simple('Old Radio')).expect(201)).body;
    await post(`/products/${hidden.id}/archive`).expect(200);

    const all = (await get('/products').expect(200)).body;
    expect(all.total).toBe(3);

    expect(
      (await get('/products?q=headph').expect(200)).body.items.map((i: { name: string }) => i.name),
    ).toEqual(['Wireless Headphones']);
    expect((await get('/products?q=audio').expect(200)).body.total).toBe(2);
    expect((await get('/products?stock=out').expect(200)).body.items[0]).toMatchObject({
      name: 'Kitenge Dress',
      state: 'out',
    });
    expect(
      (await get('/products?stock=low').expect(200)).body.items.map(
        (i: { name: string }) => i.name,
      ),
    ).toEqual(['Bluetooth Speaker']);
    expect(
      (await get(`/products?categoryId=${cat.id}&sort=price`).expect(200)).body.items.map(
        (i: { priceMinMinor: number }) => i.priceMinMinor,
      ),
    ).toEqual([35000, 50000]);
    expect((await get('/products?status=ARCHIVED').expect(200)).body.items[0].name).toBe(
      'Old Radio',
    );

    const page = (await get('/products?sort=name&pageSize=2&page=2').expect(200)).body;
    expect(page).toMatchObject({ total: 3, page: 2, pageSize: 2 });
    expect(page.items.map((i: { name: string }) => i.name)).toEqual(['Wireless Headphones']);
    expect(page.items[0]).toMatchObject({ singleVariantId: expect.any(String), variantCount: 1 });
  });
});

describe('product images', () => {
  it('stores AVIF + WebP renditions without metadata and serves them', async () => {
    const p = (await post('/products', simple('Basket')).expect(201)).body;
    const res = await agent
      .post(`/api/admin/products/${p.id}/images`)
      .set('x-csrf-token', csrf)
      .attach('files', await jpeg(2000, 1500, true), 'photo.jpg')
      .attach('files', await jpeg(500, 500), 'small.jpg')
      .expect(201);
    const [big, small] = res.body;
    // EXIF orientation 6 (rotated 90°) is applied before the metadata is dropped.
    expect(big).toMatchObject({ width: 1500, height: 2000 });
    expect(big.srcSet.webp.split(', ').map((s: string) => s.split(' ')[1])).toEqual([
      '320w',
      '640w',
      '1024w',
      '1500w',
    ]);
    expect(small.srcSet.avif.split(', ').map((s: string) => s.split(' ')[1])).toEqual([
      '320w',
      '500w',
    ]);
    expect(big.blurDataUrl).toMatch(/^data:image\/webp;base64,/);

    const served = await t.http().get(big.src).expect(200);
    const meta = await sharp(served.body as Buffer).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();

    const reordered = (
      await put(`/products/${p.id}/images/order`, { ids: [small.id, big.id] }).expect(200)
    ).body;
    expect(reordered.map((i: { id: string }) => i.id)).toEqual([small.id, big.id]);
    expect((await get('/products').expect(200)).body.items[0].image.id).toBe(small.id);

    const file = join(t.config.paths.uploads, big.src.replace('/media/', 'public/'));
    expect(existsSync(file)).toBe(true);
    await del(`/products/${p.id}/images/${big.id}`).expect(200);
    expect(
      readdirSync(dirname(file)).filter((n) =>
        n.startsWith(big.src.split('/').pop()!.split('-')[0]),
      ),
    ).toEqual([]);
  });

  it('rejects files that aren’t images', async () => {
    const p = (await post('/products', simple('Basket')).expect(201)).body;
    const res = await agent
      .post(`/api/admin/products/${p.id}/images`)
      .set('x-csrf-token', csrf)
      .attach('files', Buffer.concat([Buffer.from('MZ'), Buffer.alloc(300)]), 'photo.jpg')
      .expect(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');
  });
});

describe('stock API', () => {
  it('adjusts, keeps history and summarises', async () => {
    const p = (
      await post(
        '/products',
        simple('Lamp', { variants: [{ priceMinor: 9000, initialStock: 5, lowStockThreshold: 2 }] }),
      ).expect(201)
    ).body;
    const v = p.variants[0].id;

    await post(`/inventory/${v}/adjust`, { mode: 'add', quantity: 3, reason: 'RECEIVED' }).expect(
      201,
    );
    await post(`/inventory/${v}/adjust`, {
      mode: 'remove',
      quantity: 1,
      reason: 'DAMAGED',
      note: 'Cracked',
    }).expect(201);
    const set = (
      await post(`/inventory/${v}/adjust`, { mode: 'set', quantity: 2, reason: 'COUNT' }).expect(
        201,
      )
    ).body;
    expect(set).toMatchObject({ onHand: 2, available: 2, state: 'low' });

    const db = t.app.get(DATABASE).db;
    const order = createOrder(db, [{ variantId: v, quantity: 2 }]);
    reserveOrder(db, order);
    const below = await post(`/inventory/${v}/adjust`, {
      mode: 'remove',
      quantity: 1,
      reason: 'DAMAGED',
    }).expect(409);
    expect(below.body.error.fields.quantity).toMatch(/reserved/);
    commitOrderSale(db, order);

    const history = (await get(`/inventory/${v}/movements`).expect(200)).body;
    expect(
      history.items.map((m: { reason: string; deltaOnHand: number; note: string | null }) => [
        m.reason,
        m.deltaOnHand,
        m.note,
      ]),
    ).toEqual([
      ['SALE', -2, null],
      ['RESERVE', 0, null],
      ['CORRECTION', -5, 'Stock count correction'],
      ['MANUAL_ADJUST', -1, 'Damaged or lost: Cracked'],
      ['MANUAL_ADJUST', 3, 'New stock received'],
      ['MANUAL_ADJUST', 5, 'Initial stock'],
    ]);
    expect(history.items[0].orderRef).toMatch(/^T-/);
    expect(history.items[2].userName).toBe('Shop owner');

    await agent
      .patch(`/api/admin/inventory/${v}`)
      .set('x-csrf-token', csrf)
      .send({ lowStockThreshold: 0 })
      .expect(200);
    const summary = (await get('/inventory/summary').expect(200)).body;
    expect(summary).toMatchObject({ variants: 1, unitsAvailable: 0, low: 0, out: 1 });
    expect(summary.attention[0]).toMatchObject({ productName: 'Lamp', state: 'out' });
  });
});

describe('snap', () => {
  it('needs a Gemini key', async () => {
    await t.close();
    t = await startTestApp();
    ({ agent, csrf } = await signIn(t));
    const res = await agent
      .post('/api/admin/products/snap')
      .set('x-csrf-token', csrf)
      .field('note', 'red bag')
      .expect(503);
    expect(res.body.error.code).toBe('AI_NOT_CONFIGURED');
  });

  it('turns a photo and note into suggestions, never inventing a category', async () => {
    const cat = (await post('/categories', { name: 'Fabric' }).expect(201)).body;
    const ai = t.app.get<AiProvider>(AI_PROVIDER);
    const spy = vi.spyOn(ai, 'generateJson').mockResolvedValue({
      name: 'Blue Chitenge',
      description: 'Bright cotton chitenge, 2 metres.',
      price: 'K60',
      quantity: 5,
      category: 'fabric',
      heard: 'blue chitenge sixty kwacha five pieces',
    });
    const res = await agent
      .post('/api/admin/products/snap')
      .set('x-csrf-token', csrf)
      .attach('image', await jpeg(800, 600), 'snap.jpg')
      .field('note', 'from Kamwala')
      .expect(200);
    expect(res.body).toEqual({
      name: 'Blue Chitenge',
      description: 'Bright cotton chitenge, 2 metres.',
      priceMinor: 6000,
      quantity: 5,
      categoryId: cat.id,
      heard: 'blue chitenge sixty kwacha five pieces',
    });
    const [parts] = spy.mock.calls[0]!;
    expect(parts[0]!.media!.mimeType).toBe('image/jpeg');
    expect(parts.at(-1)!.text).toContain('from Kamwala');

    spy.mockResolvedValue({
      name: 'Bag',
      description: '',
      price: null,
      quantity: null,
      category: 'Shoes',
      heard: null,
    });
    const second = await agent
      .post('/api/admin/products/snap')
      .set('x-csrf-token', csrf)
      .field('note', 'bag')
      .expect(200);
    expect(second.body).toMatchObject({ priceMinor: null, categoryId: null });
  });
});
