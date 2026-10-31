import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { businessSettings, type DatabaseHandle } from '@snapsell/db';
import {
  type Availability,
  type CartInput,
  type ImageDto,
  MAX_LINE_QUANTITY,
  type PricedCart,
  type PricedLine,
  type StoreCategory,
  type StoreListQuery,
  storeListQuerySchema,
  type StoreProduct,
  type StoreProductList,
  variantLabel,
} from '@snapsell/shared';
import { ApiError } from '../common/errors.js';
import { ftsQuery } from '../catalog/products.service.js';
import { ProductImageService } from '../catalog/product-images.service.js';
import { DATABASE } from '../database/database.module.js';

/** Products customers can see. Hidden (INACTIVE) and archived ones never leave the admin. */
const VISIBLE = `p.status in ('ACTIVE', 'UNAVAILABLE')`;

interface VariantRow {
  variant_id: string;
  product_id: string;
  product_name: string;
  product_slug: string;
  product_status: string;
  option_names: string;
  option_values: string;
  price_minor: number;
  compare_at_minor: number | null;
  currency: string;
  on_hand: number;
  reserved: number;
  low_stock_threshold: number;
}

interface ImageRow {
  id: string;
  product_id: string;
  file_key: string;
  widths: string;
  width: number | null;
  height: number | null;
  blur_data_url: string | null;
  alt: string;
}

export function availabilityOf(available: number, threshold: number): Availability {
  if (available <= 0) return { state: 'sold_out' };
  if (available <= threshold) return { state: 'low', left: available };
  return { state: 'in_stock' };
}

/** Read-only catalogue for customers, and the trusted cart pricing used by checkout. */
@Injectable()
export class StorefrontService {
  constructor(
    @Inject(DATABASE) private readonly handle: DatabaseHandle,
    private readonly images: ProductImageService,
  ) {}

  categories(): StoreCategory[] {
    return this.handle.sqlite
      .prepare(
        `select c.id, c.name, c.slug,
                (select count(*) from products p where p.category_id = c.id and ${VISIBLE}) as productCount
         from categories c
         where c.archived_at is null
         order by c.sort_order, c.name`,
      )
      .all()
      .filter((c) => (c as StoreCategory).productCount > 0) as StoreCategory[];
  }

  list(query: StoreListQuery): StoreProductList {
    const q = storeListQuerySchema.parse(query);
    const where = [VISIBLE];
    const params: Record<string, unknown> = {};
    if (q.category) {
      where.push(
        'p.category_id = (select id from categories where slug = @category and archived_at is null)',
      );
      params.category = q.category;
    }
    const match = q.q ? ftsQuery(q.q) : '';
    if (match) {
      where.push('p.id in (select product_id from products_fts where products_fts match @match)');
      params.match = match;
    }
    const order = {
      featured: `(p.status = 'ACTIVE' and v.available > 0) desc, p.updated_at desc`,
      newest: 'p.created_at desc',
      'price-asc': 'v.price_min asc',
      'price-desc': 'v.price_min desc',
    }[q.sort];
    const from = `
      from products p
      join (
        select pv.product_id, min(pv.price_minor) as price_min, max(pv.price_minor) as price_max,
               max(pv.compare_at_minor) as compare_at, max(pv.currency) as currency,
               sum(max(i.on_hand - i.reserved, 0)) as available,
               max(case when i.on_hand - i.reserved > i.low_stock_threshold then 1 else 0 end) as any_in_stock
        from product_variants pv join inventory i on i.variant_id = pv.id
        group by pv.product_id
      ) v on v.product_id = p.id
      where ${where.join(' and ')}`;
    const { sqlite } = this.handle;
    const total = (sqlite.prepare(`select count(*) as n ${from}`).get(params) as { n: number }).n;
    const rows = sqlite
      .prepare(
        `select p.id, p.slug, p.name, p.status, v.price_min, v.price_max, v.compare_at, v.currency, v.available, v.any_in_stock
         ${from} order by ${order} limit @limit offset @offset`,
      )
      .all({ ...params, limit: q.pageSize, offset: (q.page - 1) * q.pageSize }) as Array<{
      id: string;
      slug: string;
      name: string;
      status: string;
      price_min: number;
      price_max: number;
      compare_at: number | null;
      currency: string;
      available: number;
      any_in_stock: number;
    }>;
    const covers = this.coverImages(rows.map((r) => r.id));
    return {
      total,
      page: q.page,
      pageSize: q.pageSize,
      items: rows.map((r) => {
        const orderable = r.status === 'ACTIVE' && r.available > 0;
        return {
          id: r.id,
          slug: r.slug,
          name: r.name,
          image: covers.get(r.id) ?? null,
          priceMinMinor: r.price_min,
          priceMaxMinor: r.price_max,
          compareAtMinor: r.compare_at,
          currency: r.currency,
          orderable,
          availability: !orderable
            ? { state: 'sold_out' }
            : r.any_in_stock
              ? { state: 'in_stock' }
              : { state: 'low', left: r.available },
        };
      }),
    };
  }

  product(slug: string): StoreProduct {
    const { sqlite } = this.handle;
    const p = sqlite
      .prepare(
        `select p.id, p.slug, p.name, p.description, p.status, p.option_names, c.name as category_name, c.slug as category_slug
         from products p left join categories c on c.id = p.category_id and c.archived_at is null
         where p.slug = ? and ${VISIBLE}`,
      )
      .get(slug) as
      | {
          id: string;
          slug: string;
          name: string;
          description: string;
          status: string;
          option_names: string;
          category_name: string | null;
          category_slug: string | null;
        }
      | undefined;
    if (!p) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'This product isn’t available.');
    const optionNames = JSON.parse(p.option_names) as string[];
    const variants = this.variantRows('pv.product_id = ?', [p.id]);
    const orderable = p.status === 'ACTIVE';
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description,
      category: p.category_name ? { name: p.category_name, slug: p.category_slug! } : null,
      optionNames,
      currency: variants[0]?.currency ?? this.settings().currency,
      images: this.images.list(p.id),
      orderable,
      variants: variants.map((v) => {
        const available = Math.max(0, v.on_hand - v.reserved);
        return {
          id: v.variant_id,
          optionValues: JSON.parse(v.option_values) as Record<string, string>,
          label: variantLabel(optionNames, JSON.parse(v.option_values) as Record<string, string>),
          priceMinor: v.price_minor,
          compareAtMinor: v.compare_at_minor,
          availability: orderable
            ? availabilityOf(available, v.low_stock_threshold)
            : { state: 'sold_out' },
          maxQuantity: orderable ? Math.min(available, MAX_LINE_QUANTITY) : 0,
        };
      }),
    };
  }

  /**
   * Prices a cart from the database only (BUILD_PLAN Phase 3: never trust browser prices).
   * Duplicate lines are merged; quantities are capped at what is available.
   */
  priceCart(cart: CartInput): PricedCart {
    const settings = this.settings();
    const merged = new Map<string, number>();
    for (const item of cart.items)
      merged.set(
        item.variantId,
        Math.min(MAX_LINE_QUANTITY, (merged.get(item.variantId) ?? 0) + item.quantity),
      );
    const ids = [...merged.keys()];
    const rows = ids.length
      ? this.variantRows(`pv.id in (${ids.map(() => '?').join(',')})`, ids)
      : [];
    const byId = new Map(rows.map((r) => [r.variant_id, r]));
    const covers = this.coverImages([...new Set(rows.map((r) => r.product_id))]);

    const lines: PricedLine[] = [];
    for (const [variantId, wanted] of merged) {
      const r = byId.get(variantId);
      if (!r) continue; // deleted since it was added to the cart
      const available = r.product_status === 'ACTIVE' ? Math.max(0, r.on_hand - r.reserved) : 0;
      const quantity = Math.min(wanted, available);
      const status = available === 0 ? 'unavailable' : quantity < wanted ? 'reduced' : 'ok';
      lines.push({
        variantId,
        productName: r.product_name,
        productSlug: r.product_slug,
        variantLabel: variantLabel(
          JSON.parse(r.option_names) as string[],
          JSON.parse(r.option_values) as Record<string, string>,
        ),
        image: covers.get(r.product_id) ?? null,
        unitPriceMinor: r.price_minor,
        quantity: status === 'unavailable' ? wanted : quantity,
        lineTotalMinor: status === 'unavailable' ? 0 : r.price_minor * quantity,
        status,
        maxQuantity: Math.min(available, MAX_LINE_QUANTITY),
      });
    }
    return {
      lines,
      currency: rows[0]?.currency ?? settings.currency,
      subtotalMinor: lines.reduce((sum, l) => sum + l.lineTotalMinor, 0),
      delivery: { enabled: settings.deliveryEnabled, feeMinor: settings.deliveryFeeMinor },
      collection: { enabled: settings.collectionEnabled, address: settings.address },
    };
  }

  settings() {
    return this.handle.db.select().from(businessSettings).get()!;
  }

  private variantRows(where: string, params: unknown[]) {
    return this.handle.sqlite
      .prepare(
        `select pv.id as variant_id, p.id as product_id, p.name as product_name, p.slug as product_slug, p.status as product_status,
                p.option_names, pv.option_values, pv.price_minor, pv.compare_at_minor, pv.currency,
                i.on_hand, i.reserved, i.low_stock_threshold
         from product_variants pv join products p on p.id = pv.product_id join inventory i on i.variant_id = pv.id
         where ${where} order by pv.sort_order, pv.created_at`,
      )
      .all(...params) as VariantRow[];
  }

  private coverImages(productIds: string[]) {
    const map = new Map<string, ImageDto>();
    if (!productIds.length) return map;
    const rows = this.handle.sqlite
      .prepare(
        `select * from product_images pi
         where pi.product_id in (${productIds.map(() => '?').join(',')})
           and pi.id = (select id from product_images where product_id = pi.product_id order by sort_order, created_at limit 1)`,
      )
      .all(...productIds) as ImageRow[];
    for (const r of rows) {
      map.set(
        r.product_id,
        this.images.toDto({
          id: r.id,
          alt: r.alt,
          fileKey: r.file_key,
          widths: JSON.parse(r.widths) as number[],
          width: r.width,
          height: r.height,
          blurDataUrl: r.blur_data_url,
        }),
      );
    }
    return map;
  }
}
