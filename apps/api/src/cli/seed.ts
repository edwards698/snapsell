// Development sample catalogue: `pnpm seed` (add --force to seed even if products exist).
// Goes through the real services, so images use the same rendition pipeline as uploads.
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { type DatabaseHandle } from '@snapsell/db';
import sharp from 'sharp';
import { AppModule } from '../app.module.js';
import { findOwner } from '../auth/owner.js';
import { CategoriesService } from '../catalog/categories.service.js';
import { ProductImageService } from '../catalog/product-images.service.js';
import { ProductsService } from '../catalog/products.service.js';
import { loadConfig } from '../config/config.js';
import { DATABASE } from '../database/database.module.js';

interface SeedProduct {
  name: string;
  category: string;
  description: string;
  colors: [string, string];
  options?: string[];
  variants: Array<{
    values?: Record<string, string>;
    price: number;
    compareAt?: number;
    stock: number;
  }>;
}

const CATEGORIES = ['Audio', 'Fabric & Clothing', 'Home', 'Accessories'];

const PRODUCTS: SeedProduct[] = [
  {
    name: 'Wireless Headphones',
    category: 'Audio',
    description: 'Over-ear Bluetooth headphones with 30 hours of battery and a soft carry case.',
    colors: ['#0f766e', '#134e4a'],
    options: ['Colour'],
    variants: [
      { values: { Colour: 'Black' }, price: 350, stock: 12 },
      { values: { Colour: 'White' }, price: 350, stock: 3 },
    ],
  },
  {
    name: 'Bluetooth Speaker',
    category: 'Audio',
    description: 'Portable, splash-proof speaker with deep bass. Charges by USB-C.',
    colors: ['#7c3aed', '#4c1d95'],
    variants: [{ price: 480, compareAt: 550, stock: 2 }],
  },
  {
    name: 'Blue Chitenge',
    category: 'Fabric & Clothing',
    description: 'Bright cotton chitenge, two metres, in a bold blue print.',
    colors: ['#2563eb', '#1e3a8a'],
    variants: [{ price: 60, stock: 40 }],
  },
  {
    name: 'Kitenge Shirt',
    category: 'Fabric & Clothing',
    description: 'Short-sleeved shirt in vibrant kitenge fabric. Tailored in Lusaka.',
    colors: ['#ea580c', '#9a3412'],
    options: ['Size'],
    variants: [
      { values: { Size: 'M' }, price: 250, stock: 4 },
      { values: { Size: 'L' }, price: 250, stock: 6 },
      { values: { Size: 'XL' }, price: 270, stock: 0 },
    ],
  },
  {
    name: 'Woven Basket',
    category: 'Home',
    description: 'Hand-woven sisal basket for fruit, bread or storage.',
    colors: ['#ca8a04', '#854d0e'],
    variants: [{ price: 180, stock: 6 }],
  },
  {
    name: 'Ceramic Mug',
    category: 'Home',
    description: 'Glazed stoneware mug, 350 ml. Dishwasher safe.',
    colors: ['#db2777', '#831843'],
    variants: [{ price: 75, stock: 0 }],
  },
  {
    name: 'Beaded Necklace',
    category: 'Accessories',
    description: 'Handmade necklace with glass beads in warm colours.',
    colors: ['#dc2626', '#7f1d1d'],
    variants: [{ price: 120, compareAt: 150, stock: 15 }],
  },
  {
    name: 'Leather Sandals',
    category: 'Accessories',
    description: 'Genuine leather sandals with a cushioned sole.',
    colors: ['#78350f', '#451a03'],
    options: ['Size'],
    variants: [
      { values: { Size: '40' }, price: 300, stock: 5 },
      { values: { Size: '41' }, price: 300, stock: 1 },
      { values: { Size: '42' }, price: 300, stock: 8 },
    ],
  },
];

/** A simple illustrated "product photo" so the sample shop looks real without stock photos. */
function illustration(name: string, [from, to]: [string, string]) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1500" viewBox="0 0 1200 1500">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient>
    <radialGradient id="l" cx="0.3" cy="0.2" r="0.8"><stop offset="0" stop-color="#fff" stop-opacity="0.35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1200" height="1500" fill="url(#g)"/>
  <rect width="1200" height="1500" fill="url(#l)"/>
  <circle cx="600" cy="660" r="330" fill="#fff" fill-opacity="0.14"/>
  <circle cx="600" cy="660" r="230" fill="#fff" fill-opacity="0.18"/>
  <text x="600" y="745" font-family="Helvetica, Arial, sans-serif" font-size="240" font-weight="700" text-anchor="middle" fill="#fff">${initials}</text>
  <text x="600" y="1260" font-family="Helvetica, Arial, sans-serif" font-size="72" font-weight="600" text-anchor="middle" fill="#fff" fill-opacity="0.92">${name}</text>
</svg>`);
}

async function main() {
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
    if (products.list({}).total > 0 && !process.argv.includes('--force')) {
      console.log(
        'Products already exist – skipping. Use --force to add the sample catalogue anyway.',
      );
      return;
    }
    const categories = app.get(CategoriesService);
    const existing = new Map(categories.list().map((c) => [c.name, c.id]));
    for (const name of CATEGORIES)
      if (!existing.has(name)) existing.set(name, categories.create(name, owner.id).id);

    const images = app.get(ProductImageService);
    for (const p of PRODUCTS) {
      const created = products.create(
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
      const photo = await sharp(illustration(p.name, p.colors)).jpeg({ quality: 90 }).toBuffer();
      await images.add(created.id, [photo]);
      console.log(`  + ${p.name}`);
    }
    console.log(`Seeded ${PRODUCTS.length} products in ${CATEGORIES.length} categories.`);
  } finally {
    await app.close();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
