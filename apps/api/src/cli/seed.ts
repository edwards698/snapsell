// Development sample catalogue: `pnpm seed`
//   --force   seed even if products already exist (adds alongside them)
//   --replace delete existing products first, then seed (needs no open order lines)
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { type DatabaseHandle, products as productsTable } from '@snapsell/db';
import sharp from 'sharp';
import { AppModule } from '../app.module.js';
import { findOwner } from '../auth/owner.js';
import { CategoriesService } from '../catalog/categories.service.js';
import { ProductImageService } from '../catalog/product-images.service.js';
import { ProductsService } from '../catalog/products.service.js';
import { loadConfig } from '../config/config.js';
import { DATABASE } from '../database/database.module.js';
import { CATEGORIES, PRODUCTS } from './seed-catalogue.js';

function escapeXml(text: string) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** A simple illustrated "product photo" so the sample shop looks real without stock photos. */
function illustration(name: string, [from, to]: [string, string]) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const label = name.length > 36 ? `${name.slice(0, 34)}…` : name;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1500" viewBox="0 0 1200 1500">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient>
    <radialGradient id="l" cx="0.3" cy="0.2" r="0.8"><stop offset="0" stop-color="#fff" stop-opacity="0.35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1200" height="1500" fill="url(#g)"/>
  <rect width="1200" height="1500" fill="url(#l)"/>
  <circle cx="600" cy="660" r="330" fill="#fff" fill-opacity="0.14"/>
  <circle cx="600" cy="660" r="230" fill="#fff" fill-opacity="0.18"/>
  <text x="600" y="745" font-family="Helvetica, Arial, sans-serif" font-size="240" font-weight="700" text-anchor="middle" fill="#fff">${escapeXml(initials)}</text>
  <text x="600" y="1260" font-family="Helvetica, Arial, sans-serif" font-size="52" font-weight="600" text-anchor="middle" fill="#fff" fill-opacity="0.92">${escapeXml(label)}</text>
</svg>`);
}

async function main() {
  const force = process.argv.includes('--force');
  const replace = process.argv.includes('--replace');
  const config = loadConfig();
  const app = await NestFactory.createApplicationContext(AppModule.forRoot(config), {
    logger: false,
  });
  try {
    const handle = app.get<DatabaseHandle>(DATABASE);
    const owner = findOwner(handle.db);
    if (!owner)
      throw new Error(
        'Create the owner account first (start the API once, or run `pnpm reset-owner-password`).',
      );
    const products = app.get(ProductsService);
    const existingCount = products.list({}).total;

    if (existingCount > 0 && replace) {
      console.log(`Removing ${existingCount} existing products…`);
      const ids = handle.db.select({ id: productsTable.id }).from(productsTable).all();
      for (const { id } of ids) {
        try {
          await products.delete(id, owner.id);
        } catch (err) {
          console.warn(
            `  ! skipped ${id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    } else if (existingCount > 0 && !force) {
      console.log(
        'Products already exist – skipping. Use --force to add alongside them, or --replace to wipe and reseed.',
      );
      return;
    }

    const categories = app.get(CategoriesService);
    const existing = new Map(categories.list().map((c) => [c.name, c.id]));
    for (const name of CATEGORIES)
      if (!existing.has(name)) existing.set(name, categories.create(name, owner.id).id);

    const images = app.get(ProductImageService);
    let created = 0;
    for (const p of PRODUCTS) {
      const product = products.create(
        {
          name: p.name,
          description: p.description,
          categoryId: existing.get(p.category)!,
          status: 'ACTIVE',
          optionNames: p.options ?? [],
          variants: p.variants.map((v) => ({
            sku: '',
            optionValues: v.values ?? {},
            priceMinor: v.price * 100,
            compareAtMinor: v.compareAt ? v.compareAt * 100 : null,
            initialStock: v.stock,
            lowStockThreshold: 3,
          })),
        },
        owner.id,
      );
      const photo = await sharp(illustration(p.name, p.colors)).jpeg({ quality: 88 }).toBuffer();
      await images.add(product.id, [photo]);
      created += 1;
      console.log(`  + ${p.name}`);
    }
    console.log(
      `Seeded ${created} products across ${CATEGORIES.length} categories (${PRODUCTS.length} in catalogue).`,
    );
  } finally {
    await app.close();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
