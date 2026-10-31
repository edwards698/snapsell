import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { type DatabaseHandle, inventory, orders, stockMovements, users } from '@snapsell/db';
import {
  ADJUSTMENT_REASONS,
  type Paginated,
  type StockAdjustment,
  stockAdjustmentSchema,
  type StockMovementDto,
  type StockRow,
  type StockSummary,
  stockListQuerySchema,
  stockState,
  variantLabel,
} from '@snapsell/shared';
import { desc, eq } from 'drizzle-orm';
import { type z } from 'zod';
import { AuditService } from '../common/audit.service.js';
import { ApiError } from '../common/errors.js';
import { EventBus } from '../common/events.js';
import { DATABASE } from '../database/database.module.js';
import {
  adjustStock,
  commitOrderSale,
  releaseOrder,
  reserveOrder,
  StockAdjustmentError,
} from './inventory-ops.js';
import { ftsQuery } from './products.service.js';
import { ProductImageService } from './product-images.service.js';

interface RawStockRow {
  variant_id: string;
  product_id: string;
  product_name: string;
  product_status: StockRow['productStatus'];
  option_names: string;
  option_values: string;
  sku: string;
  on_hand: number;
  reserved: number;
  low_stock_threshold: number;
  image_id: string | null;
  image_key: string | null;
  image_widths: string | null;
  image_width: number | null;
  image_height: number | null;
  image_blur: string | null;
}

const STOCK_SELECT = `
  select pv.id as variant_id, p.id as product_id, p.name as product_name, p.status as product_status,
         p.option_names, pv.option_values, pv.sku, i.on_hand, i.reserved, i.low_stock_threshold,
         img.id as image_id, img.file_key as image_key, img.widths as image_widths, img.width as image_width,
         img.height as image_height, img.blur_data_url as image_blur
  from product_variants pv
  join products p on p.id = pv.product_id
  join inventory i on i.variant_id = pv.id
  left join product_images img on img.id = (
    select id from product_images where product_id = p.id order by sort_order, created_at limit 1)`;

/** Stock is changed only through the functions in inventory-ops.ts; this service adds the API around them. */
@Injectable()
export class InventoryService {
  constructor(
    @Inject(DATABASE) private readonly handle: DatabaseHandle,
    private readonly images: ProductImageService,
    private readonly audit: AuditService,
    private readonly events: EventBus,
  ) {}

  list(query: z.input<typeof stockListQuerySchema>): Paginated<StockRow> {
    const q = stockListQuerySchema.parse(query);
    const where = [`p.status != 'ARCHIVED'`];
    const params: Record<string, unknown> = {};
    const match = q.q ? ftsQuery(q.q) : '';
    if (match) {
      where.push('p.id in (select product_id from products_fts where products_fts match @match)');
      params.match = match;
    }
    if (q.stock === 'out') where.push('i.on_hand - i.reserved <= 0');
    if (q.stock === 'low')
      where.push('i.on_hand - i.reserved > 0 and i.on_hand - i.reserved <= i.low_stock_threshold');
    const filter = `where ${where.join(' and ')}`;
    const { sqlite } = this.handle;
    const total = (
      sqlite
        .prepare(
          `select count(*) as n from product_variants pv join products p on p.id = pv.product_id
           join inventory i on i.variant_id = pv.id ${filter}`,
        )
        .get(params) as { n: number }
    ).n;
    const rows = sqlite
      .prepare(
        `${STOCK_SELECT} ${filter}
         order by (i.on_hand - i.reserved) <= 0 desc, (i.on_hand - i.reserved) <= i.low_stock_threshold desc,
                  p.name collate nocase, pv.sort_order
         limit @limit offset @offset`,
      )
      .all({ ...params, limit: q.pageSize, offset: (q.page - 1) * q.pageSize }) as RawStockRow[];
    return { total, page: q.page, pageSize: q.pageSize, items: rows.map((r) => this.toRow(r)) };
  }

  row(variantId: string): StockRow {
    const raw = this.handle.sqlite.prepare(`${STOCK_SELECT} where pv.id = ?`).get(variantId) as
      RawStockRow | undefined;
    if (!raw) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Variant not found.');
    return this.toRow(raw);
  }

  summary(): StockSummary {
    const { sqlite } = this.handle;
    const totals = sqlite
      .prepare(
        `select count(*) as variants,
                coalesce(sum(max(i.on_hand - i.reserved, 0)), 0) as units,
                coalesce(sum(case when i.on_hand - i.reserved > 0 and i.on_hand - i.reserved <= i.low_stock_threshold then 1 else 0 end), 0) as low,
                coalesce(sum(case when i.on_hand - i.reserved <= 0 then 1 else 0 end), 0) as out
         from inventory i join product_variants pv on pv.id = i.variant_id
         join products p on p.id = pv.product_id
         where p.status != 'ARCHIVED'`,
      )
      .get() as { variants: number; units: number; low: number; out: number };
    const attention = this.list({ stock: 'all', pageSize: 6 }).items.filter(
      (r) => r.state !== 'ok',
    );
    return {
      variants: totals.variants,
      unitsAvailable: totals.units,
      low: totals.low,
      out: totals.out,
      attention,
    };
  }

  adjust(variantId: string, input: StockAdjustment, actorId: string): StockRow {
    const a = stockAdjustmentSchema.parse(input);
    const current = this.row(variantId);
    const delta =
      a.mode === 'add'
        ? a.quantity
        : a.mode === 'remove'
          ? -a.quantity
          : a.quantity - current.onHand;
    if (delta === 0) return current;
    const reason = ADJUSTMENT_REASONS[a.reason];
    const note = a.note ? `${reason.label}: ${a.note}` : reason.label;
    try {
      adjustStock(this.handle.db, {
        variantId,
        delta,
        reason: reason.movement,
        note,
        userId: actorId,
      });
    } catch (err) {
      if (err instanceof StockAdjustmentError && err.code === 'BELOW_RESERVED') {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'VALIDATION_FAILED',
          'Please check the highlighted fields.',
          {
            quantity: err.message,
          },
        );
      }
      throw err;
    }
    this.audit.record({
      actor: 'OWNER',
      actorId,
      action: 'stock.adjusted',
      entity: 'variant',
      entityId: variantId,
      before: { onHand: current.onHand },
      after: { onHand: current.onHand + delta, reason: a.reason },
    });
    this.events.emit('stock.changed', { variantIds: [variantId] });
    return this.row(variantId);
  }

  setThreshold(variantId: string, lowStockThreshold: number): StockRow {
    this.row(variantId);
    this.handle.db
      .update(inventory)
      .set({ lowStockThreshold })
      .where(eq(inventory.variantId, variantId))
      .run();
    this.events.emit('stock.changed', { variantIds: [variantId] });
    return this.row(variantId);
  }

  history(variantId: string, page = 1, pageSize = 30): Paginated<StockMovementDto> {
    this.row(variantId);
    const { db, sqlite } = this.handle;
    const total = (
      sqlite
        .prepare('select count(*) as n from stock_movements where variant_id = ?')
        .get(variantId) as { n: number }
    ).n;
    const items = db
      .select({ m: stockMovements, orderRef: orders.ref, userName: users.name })
      .from(stockMovements)
      .leftJoin(orders, eq(orders.id, stockMovements.orderId))
      .leftJoin(users, eq(users.id, stockMovements.userId))
      .where(eq(stockMovements.variantId, variantId))
      .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .all()
      .map(({ m, orderRef, userName }) => ({
        id: m.id,
        deltaOnHand: m.deltaOnHand,
        deltaReserved: m.deltaReserved,
        reason: m.reason,
        note: m.note,
        orderRef: orderRef ?? null,
        userName: userName ?? null,
        createdAt: m.createdAt.toISOString(),
      }));
    return { items, total, page, pageSize };
  }

  // Order-facing operations, used by checkout (Phase 3) and payments (Phase 4).

  reserve(orderId: string) {
    return this.notify(reserveOrder(this.handle.db, orderId), orderId);
  }

  release(orderId: string) {
    return this.notify(releaseOrder(this.handle.db, orderId), orderId);
  }

  commitSale(orderId: string) {
    return this.notify(commitOrderSale(this.handle.db, orderId), orderId);
  }

  private notify<T extends { ok: boolean }>(result: T, orderId: string) {
    if (result.ok) {
      const ids = this.handle.sqlite
        .prepare('select distinct variant_id as id from order_items where order_id = ?')
        .all(orderId) as Array<{ id: string }>;
      this.events.emit('stock.changed', { variantIds: ids.map((r) => r.id) });
    }
    return result;
  }

  private toRow(r: RawStockRow): StockRow {
    const available = Math.max(0, r.on_hand - r.reserved);
    return {
      variantId: r.variant_id,
      productId: r.product_id,
      productName: r.product_name,
      productStatus: r.product_status,
      label: variantLabel(
        JSON.parse(r.option_names) as string[],
        JSON.parse(r.option_values) as Record<string, string>,
      ),
      sku: r.sku,
      onHand: r.on_hand,
      reserved: r.reserved,
      available,
      lowStockThreshold: r.low_stock_threshold,
      state: stockState(available, r.low_stock_threshold),
      image: r.image_id
        ? this.images.toDto({
            id: r.image_id,
            alt: '',
            fileKey: r.image_key!,
            widths: JSON.parse(r.image_widths ?? '[]') as number[],
            width: r.image_width,
            height: r.image_height,
            blurDataUrl: r.image_blur,
          })
        : null,
    };
  }
}
