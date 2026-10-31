import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  businessSettings,
  type DatabaseHandle,
  type DbLike,
  inventory,
  newId,
  orderItems,
  products,
  productVariants,
} from '@snapsell/db';
import {
  type Paginated,
  type ProductDetail,
  type ProductInputParsed,
  type ProductListItem,
  type ProductListQuery,
  productListQuerySchema,
  stockState,
  type VariantDto,
  variantLabel,
} from '@snapsell/shared';
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import { AuditService } from '../common/audit.service.js';
import { ApiError } from '../common/errors.js';
import { EventBus } from '../common/events.js';
import { generateSku, uniqueSlug } from '../common/slug.js';
import { DATABASE } from '../database/database.module.js';
import { CategoriesService } from './categories.service.js';
import { adjustStock } from './inventory-ops.js';
import { ProductImageService } from './product-images.service.js';

/** Turns free text into an FTS5 prefix query: `wire head` → `"wire"* "head"*` (all terms must match). */
export function ftsQuery(text: string) {
  const terms = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return terms
    .slice(0, 8)
    .map((t) => `"${t}"*`)
    .join(' ');
}

const SORTS = {
  updated: 'p.updated_at desc',
  name: 'p.name collate nocase asc',
  price: 'v.price_min asc, p.name collate nocase asc',
  stock: 'v.available asc, p.name collate nocase asc',
} as const;

interface ListRow {
  id: string;
  name: string;
  slug: string;
  status: ProductDetail['status'];
  updated_at: number;
  category_id: string | null;
  category_name: string | null;
  price_min: number;
  price_max: number;
  compare_at: number | null;
  currency: string;
  variant_count: number;
  single_variant_id: string | null;
  on_hand: number;
  available: number;
  out_count: number;
  low_count: number;
  image_id: string | null;
  image_key: string | null;
  image_widths: string | null;
  image_width: number | null;
  image_height: number | null;
  image_blur: string | null;
  image_alt: string | null;
}

const invalid = (fields: Record<string, string>) =>
  new ApiError(
    HttpStatus.BAD_REQUEST,
    'VALIDATION_FAILED',
    'Please check the highlighted fields.',
    fields,
  );

@Injectable()
export class ProductsService {
  constructor(
    @Inject(DATABASE) private readonly handle: DatabaseHandle,
    private readonly images: ProductImageService,
    private readonly categories: CategoriesService,
    private readonly audit: AuditService,
    private readonly events: EventBus,
  ) {}

  list(query: ProductListQuery): Paginated<ProductListItem> {
    const q = productListQuerySchema.parse(query);
    const where: string[] = [];
    const params: Record<string, unknown> = {};
    if (q.status === 'all') where.push(`p.status != 'ARCHIVED'`);
    else {
      where.push('p.status = @status');
      params.status = q.status;
    }
    if (q.categoryId) {
      where.push(q.categoryId === 'none' ? 'p.category_id is null' : 'p.category_id = @categoryId');
      params.categoryId = q.categoryId;
    }
    const match = q.q ? ftsQuery(q.q) : '';
    if (match) {
      where.push('p.id in (select product_id from products_fts where products_fts match @match)');
      params.match = match;
    }
    if (q.stock === 'out') where.push('v.available <= 0');
    if (q.stock === 'low') where.push('v.available > 0 and (v.low_count > 0 or v.out_count > 0)');

    const from = `
      from products p
      left join categories c on c.id = p.category_id
      left join (
        select pv.product_id,
               min(pv.price_minor) as price_min,
               max(pv.price_minor) as price_max,
               max(pv.compare_at_minor) as compare_at,
               max(pv.currency) as currency,
               count(*) as variant_count,
               case when count(*) = 1 then max(pv.id) end as single_variant_id,
               sum(i.on_hand) as on_hand,
               sum(max(i.on_hand - i.reserved, 0)) as available,
               sum(case when i.on_hand - i.reserved <= 0 then 1 else 0 end) as out_count,
               sum(case when i.on_hand - i.reserved > 0 and i.on_hand - i.reserved <= i.low_stock_threshold then 1 else 0 end) as low_count
        from product_variants pv join inventory i on i.variant_id = pv.id
        group by pv.product_id
      ) v on v.product_id = p.id
      ${where.length ? `where ${where.join(' and ')}` : ''}`;

    const { sqlite } = this.handle;
    const total = (sqlite.prepare(`select count(*) as n ${from}`).get(params) as { n: number }).n;
    const rows = sqlite
      .prepare(
        `select p.id, p.name, p.slug, p.status, p.updated_at, p.category_id, c.name as category_name,
                v.price_min, v.price_max, v.compare_at, v.currency, v.variant_count, v.single_variant_id,
                v.on_hand, v.available, v.out_count, v.low_count,
                img.id as image_id, img.file_key as image_key, img.widths as image_widths, img.width as image_width,
                img.height as image_height, img.blur_data_url as image_blur, img.alt as image_alt
         ${from.replace(
           'left join categories c',
           `left join product_images img on img.id = (
              select id from product_images where product_id = p.id order by sort_order, created_at limit 1)
            left join categories c`,
         )}
         order by ${SORTS[q.sort]}
         limit @limit offset @offset`,
      )
      .all({ ...params, limit: q.pageSize, offset: (q.page - 1) * q.pageSize }) as ListRow[];

    const settingsCurrency = this.currency();
    return {
      total,
      page: q.page,
      pageSize: q.pageSize,
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        status: r.status,
        category: r.category_id ? { id: r.category_id, name: r.category_name ?? '' } : null,
        image: r.image_id
          ? this.images.toDto({
              id: r.image_id,
              alt: r.image_alt ?? '',
              fileKey: r.image_key!,
              widths: JSON.parse(r.image_widths ?? '[]') as number[],
              width: r.image_width,
              height: r.image_height,
              blurDataUrl: r.image_blur,
            })
          : null,
        priceMinMinor: r.price_min ?? 0,
        priceMaxMinor: r.price_max ?? 0,
        compareAtMinor: r.compare_at,
        currency: r.currency ?? settingsCurrency,
        variantCount: r.variant_count ?? 0,
        singleVariantId: r.single_variant_id,
        onHand: r.on_hand ?? 0,
        available: r.available ?? 0,
        state: (r.available ?? 0) <= 0 ? 'out' : r.low_count > 0 || r.out_count > 0 ? 'low' : 'ok',
        updatedAt: new Date(r.updated_at).toISOString(),
      })),
    };
  }

  get(id: string): ProductDetail {
    const { db } = this.handle;
    const product = db.select().from(products).where(eq(products.id, id)).get();
    if (!product) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Product not found.');
    const ordered = new Set(
      db
        .selectDistinct({ id: orderItems.variantId })
        .from(orderItems)
        .innerJoin(productVariants, eq(productVariants.id, orderItems.variantId))
        .where(eq(productVariants.productId, id))
        .all()
        .map((r) => r.id),
    );
    const variants: VariantDto[] = db
      .select({ v: productVariants, i: inventory })
      .from(productVariants)
      .innerJoin(inventory, eq(inventory.variantId, productVariants.id))
      .where(eq(productVariants.productId, id))
      .orderBy(asc(productVariants.sortOrder), asc(productVariants.createdAt))
      .all()
      .map(({ v, i }) => {
        const available = Math.max(0, i.onHand - i.reserved);
        return {
          id: v.id,
          sku: v.sku,
          optionValues: v.optionValues,
          label: variantLabel(product.optionNames, v.optionValues),
          priceMinor: v.priceMinor,
          compareAtMinor: v.compareAtMinor,
          currency: v.currency,
          isDefault: v.isDefault,
          onHand: i.onHand,
          reserved: i.reserved,
          available,
          lowStockThreshold: i.lowStockThreshold,
          state: stockState(available, i.lowStockThreshold),
          hasOrders: ordered.has(v.id),
        };
      });
    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      status: product.status,
      categoryId: product.categoryId,
      optionNames: product.optionNames,
      currency: variants[0]?.currency ?? this.currency(),
      variants,
      images: this.images.list(id),
      hasOrders: ordered.size > 0,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    };
  }

  create(input: ProductInputParsed, actorId: string): ProductDetail {
    if (input.categoryId) this.categories.assertUsable(input.categoryId);
    const { db } = this.handle;
    const id = newId();
    const currency = this.currency();
    db.transaction(
      (tx) => {
        this.assertSkusFree(tx, input);
        tx.insert(products)
          .values({
            id,
            name: input.name,
            slug: this.slugFor(tx, input.name),
            description: input.description,
            categoryId: input.categoryId,
            status: input.status,
            optionNames: input.optionNames,
          })
          .run();
        input.variants.forEach((v, i) =>
          this.insertVariant(tx, id, input, v, i, currency, actorId),
        );
      },
      { behavior: 'immediate' },
    );
    this.audit.record({
      actor: 'OWNER',
      actorId,
      action: 'product.created',
      entity: 'product',
      entityId: id,
      after: { name: input.name },
    });
    this.events.emit('catalog.changed', { productId: id });
    return this.get(id);
  }

  update(id: string, input: ProductInputParsed, actorId: string): ProductDetail {
    const before = this.get(id);
    if (before.status === 'ARCHIVED') {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'PRODUCT_ARCHIVED',
        'Restore this product before editing it.',
      );
    }
    if (input.categoryId) this.categories.assertUsable(input.categoryId, before.categoryId);
    const existing = new Map(before.variants.map((v) => [v.id, v]));
    input.variants.forEach((v, i) => {
      if (v.id && !existing.has(v.id))
        throw invalid({ [`variants.${i}`]: 'This variant no longer exists. Reload the page.' });
    });
    const keep = new Set(input.variants.map((v) => v.id).filter(Boolean));
    const removed = before.variants.filter((v) => !keep.has(v.id));
    const blocked = removed.find((v) => v.hasOrders);
    if (blocked) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'VARIANT_HAS_ORDERS',
        `“${blocked.label}” has orders, so it can’t be removed. Set its stock to 0 instead.`,
      );
    }

    const { db } = this.handle;
    const changedStock: string[] = [];
    db.transaction(
      (tx) => {
        this.assertSkusFree(tx, input, id);
        tx.update(products)
          .set({
            name: input.name,
            description: input.description,
            categoryId: input.categoryId,
            status: input.status,
            optionNames: input.optionNames,
          })
          .where(eq(products.id, id))
          .run();
        if (removed.length) {
          tx.delete(productVariants)
            .where(
              inArray(
                productVariants.id,
                removed.map((v) => v.id),
              ),
            )
            .run();
        }
        input.variants.forEach((v, i) => {
          if (!v.id) {
            changedStock.push(this.insertVariant(tx, id, input, v, i, before.currency, actorId));
            return;
          }
          tx.update(productVariants)
            .set({
              sku: v.sku ? v.sku.toUpperCase() : existing.get(v.id)!.sku,
              optionValues: input.optionNames.length ? v.optionValues : {},
              priceMinor: v.priceMinor,
              compareAtMinor: v.compareAtMinor,
              isDefault: i === 0,
              sortOrder: i,
            })
            .where(eq(productVariants.id, v.id))
            .run();
          tx.update(inventory)
            .set({ lowStockThreshold: v.lowStockThreshold })
            .where(eq(inventory.variantId, v.id))
            .run();
        });
      },
      { behavior: 'immediate' },
    );

    this.audit.record({
      actor: 'OWNER',
      actorId,
      action: 'product.updated',
      entity: 'product',
      entityId: id,
      before: summarize(before),
      after: {
        name: input.name,
        status: input.status,
        variants: input.variants.map((v) => ({ sku: v.sku, priceMinor: v.priceMinor })),
      },
    });
    if (changedStock.length || removed.length) {
      this.events.emit('stock.changed', {
        variantIds: [...changedStock, ...removed.map((v) => v.id)],
      });
    }
    this.events.emit('catalog.changed', { productId: id });
    return this.get(id);
  }

  setArchived(id: string, archived: boolean, actorId: string) {
    const product = this.get(id);
    if (archived === (product.status === 'ARCHIVED')) return product;
    // Restored products come back hidden so the owner can check them before they go live.
    this.handle.db
      .update(products)
      .set({ status: archived ? 'ARCHIVED' : 'INACTIVE' })
      .where(eq(products.id, id))
      .run();
    this.audit.record({
      actor: 'OWNER',
      actorId,
      action: archived ? 'product.archived' : 'product.restored',
      entity: 'product',
      entityId: id,
    });
    this.events.emit('catalog.changed', { productId: id });
    return this.get(id);
  }

  async delete(id: string, actorId: string) {
    const product = this.get(id);
    if (product.hasOrders) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'PRODUCT_HAS_ORDERS',
        'This product has orders, so it can’t be deleted. Archive it instead.',
      );
    }
    await this.images.removeAll(id);
    this.handle.db.delete(products).where(eq(products.id, id)).run();
    this.audit.record({
      actor: 'OWNER',
      actorId,
      action: 'product.deleted',
      entity: 'product',
      entityId: id,
      before: summarize(product),
    });
    this.events.emit('catalog.changed', { productId: id });
  }

  assertExists(id: string) {
    if (
      !this.handle.db.select({ id: products.id }).from(products).where(eq(products.id, id)).get()
    ) {
      throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Product not found.');
    }
  }

  private insertVariant(
    tx: DbLike,
    productId: string,
    input: ProductInputParsed,
    v: ProductInputParsed['variants'][number],
    index: number,
    currency: string,
    actorId: string,
  ) {
    const variantId = newId();
    tx.insert(productVariants)
      .values({
        id: variantId,
        productId,
        sku: v.sku ? v.sku.toUpperCase() : this.freeSku(tx, input.name),
        optionValues: input.optionNames.length ? v.optionValues : {},
        priceMinor: v.priceMinor,
        compareAtMinor: v.compareAtMinor,
        currency,
        isDefault: index === 0,
        sortOrder: index,
      })
      .run();
    tx.insert(inventory)
      .values({ variantId, onHand: 0, lowStockThreshold: v.lowStockThreshold })
      .run();
    if (v.initialStock > 0) {
      adjustStock(tx, {
        variantId,
        delta: v.initialStock,
        reason: 'MANUAL_ADJUST',
        note: 'Initial stock',
        userId: actorId,
      });
    }
    return variantId;
  }

  private assertSkusFree(tx: DbLike, input: ProductInputParsed, productId?: string) {
    const fields: Record<string, string> = {};
    input.variants.forEach((v, i) => {
      if (!v.sku) return;
      const clash = tx
        .select({ id: productVariants.id })
        .from(productVariants)
        .where(
          and(
            eq(productVariants.sku, v.sku.toUpperCase()),
            productId ? ne(productVariants.productId, productId) : sql`1 = 1`,
          ),
        )
        .get();
      if (clash) fields[`variants.${i}.sku`] = 'Another product already uses this SKU';
    });
    if (Object.keys(fields).length) throw invalid(fields);
  }

  private freeSku(tx: DbLike, name: string) {
    for (;;) {
      const sku = generateSku(name);
      if (
        !tx
          .select({ id: productVariants.id })
          .from(productVariants)
          .where(eq(productVariants.sku, sku))
          .get()
      )
        return sku;
    }
  }

  private slugFor(tx: DbLike, name: string) {
    return uniqueSlug(
      name,
      (slug) =>
        !!tx.select({ id: products.id }).from(products).where(eq(products.slug, slug)).get(),
    );
  }

  private currency() {
    return (
      this.handle.db.select({ c: businessSettings.currency }).from(businessSettings).get()?.c ??
      'ZMW'
    );
  }
}

function summarize(p: ProductDetail) {
  return {
    name: p.name,
    status: p.status,
    variants: p.variants.map((v) => ({ sku: v.sku, priceMinor: v.priceMinor })),
  };
}
