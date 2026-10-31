import { randomBytes, timingSafeEqual } from 'node:crypto';
import { HttpStatus, Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  counters,
  customers,
  type DatabaseHandle,
  type DbLike,
  newId,
  orderItems,
  orders,
  productVariants,
} from '@snapsell/db';
import {
  type CheckoutInput,
  checkoutSchema,
  normalizePhone,
  type PublicOrder,
} from '@snapsell/shared';
import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import { type Logger } from 'pino';
import { ApiError } from '../common/errors.js';
import { AuditService } from '../common/audit.service.js';
import { EventBus } from '../common/events.js';
import { reserveOrder } from '../catalog/inventory-ops.js';
import { InventoryService } from '../catalog/inventory.service.js';
import { DATABASE } from '../database/database.module.js';
import { JobWorker } from '../jobs/job-worker.js';
import { LOGGER } from '../logging/logging.module.js';
import { PaymentsService } from '../payments/payments.service.js';
import { StorefrontService } from '../store/storefront.service.js';

class OutOfStockError extends Error {}

/** Next order reference: ORD-00001, ORD-00002… (atomic counter row). */
function nextOrderRef(db: DbLike) {
  const row = db
    .insert(counters)
    .values({ name: 'order_ref', value: 1 })
    .onConflictDoUpdate({ target: counters.name, set: { value: sql`${counters.value} + 1` } })
    .returning({ value: counters.value })
    .get();
  return `ORD-${String(row.value).padStart(5, '0')}`;
}

/** Orders from every channel are created here (BUILD_PLAN Phase 3; WhatsApp joins in Phase 7). */
@Injectable()
export class OrdersService implements OnModuleInit {
  constructor(
    @Inject(DATABASE) private readonly handle: DatabaseHandle,
    @Inject(LOGGER) private readonly logger: Logger,
    private readonly storefront: StorefrontService,
    private readonly inventory: InventoryService,
    private readonly worker: JobWorker,
    private readonly events: EventBus,
    private readonly audit: AuditService,
    private readonly payments: PaymentsService,
  ) {}

  onModuleInit() {
    this.worker.register('orders.expire', () => {
      this.expireUnpaid();
    });
    this.worker.schedule('orders.expire', 60_000, 'orders.expire');
  }

  createFromCheckout(raw: CheckoutInput) {
    const input = checkoutSchema.parse(raw);
    const { db } = this.handle;

    // A retried submit returns the order already created for this checkout.
    const existing = db
      .select()
      .from(orders)
      .where(eq(orders.idempotencyKey, input.checkoutKey))
      .get();
    if (existing)
      return { orderId: existing.id, ref: existing.ref, statusToken: existing.statusToken };

    const cart = this.storefront.priceCart({ items: input.items });
    const settings = this.storefront.settings();
    if (cart.lines.length === 0 || cart.lines.some((l) => l.status !== 'ok')) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'CART_CHANGED',
        'Some items are no longer available in the quantity you chose.',
        undefined,
        undefined,
        cart,
      );
    }
    if (input.fulfilment === 'DELIVERY' && !settings.deliveryEnabled) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_FAILED',
        'Please check the highlighted fields.',
        { fulfilment: 'Delivery isn’t available' },
      );
    }
    if (input.fulfilment === 'COLLECTION' && !settings.collectionEnabled) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_FAILED',
        'Please check the highlighted fields.',
        { fulfilment: 'Collection isn’t available' },
      );
    }
    const deliveryFeeMinor = input.fulfilment === 'DELIVERY' ? settings.deliveryFeeMinor : 0;
    const totalMinor = cart.subtotalMinor + deliveryFeeMinor;
    if (totalMinor !== input.expectedTotalMinor) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'PRICE_CHANGED',
        'Prices changed since you opened checkout. Please check the new total.',
        undefined,
        undefined,
        cart,
      );
    }

    const phone = normalizePhone(input.phone)!;
    const statusToken = randomBytes(24).toString('base64url');
    const orderId = newId();
    try {
      const ref = db.transaction(
        (tx) => {
          // Customers are matched by normalised phone number (BUILD_PLAN D12).
          const known = tx
            .select({ id: customers.id })
            .from(customers)
            .where(eq(customers.phoneE164, phone))
            .get();
          const customerId = known?.id ?? newId();
          if (known) {
            tx.update(customers)
              .set({
                fullName: input.fullName,
                ...(input.address ? { defaultAddress: input.address } : {}),
              })
              .where(eq(customers.id, customerId))
              .run();
          } else {
            tx.insert(customers)
              .values({
                id: customerId,
                fullName: input.fullName,
                phoneE164: phone,
                defaultAddress: input.address ?? null,
              })
              .run();
          }
          const ref = nextOrderRef(tx);
          tx.insert(orders)
            .values({
              id: orderId,
              ref,
              channel: 'WEBSITE',
              customerId,
              status: 'PENDING_PAYMENT',
              fulfilmentMethod: input.fulfilment,
              deliveryAddress: input.fulfilment === 'DELIVERY' ? input.address! : null,
              subtotalMinor: cart.subtotalMinor,
              deliveryFeeMinor,
              totalMinor,
              currency: cart.currency,
              reservationExpiresAt: new Date(Date.now() + settings.reservationTtlMinutes * 60_000),
              statusToken,
              idempotencyKey: input.checkoutKey,
              notes: input.notes || null,
            })
            .run();
          tx.insert(orderItems)
            .values(
              cart.lines.map((l) => ({
                id: newId(),
                orderId,
                variantId: l.variantId,
                productNameSnapshot: l.productName,
                variantLabelSnapshot: l.variantLabel === 'Default' ? '' : l.variantLabel,
                skuSnapshot: tx
                  .select({ sku: productVariants.sku })
                  .from(productVariants)
                  .where(eq(productVariants.id, l.variantId))
                  .get()!.sku,
                unitPriceMinor: l.unitPriceMinor,
                quantity: l.quantity,
                lineTotalMinor: l.lineTotalMinor,
              })),
            )
            .run();
          // Reserve inside the same transaction: if any line falls short, nothing is created.
          if (!reserveOrder(tx, orderId).ok) throw new OutOfStockError();
          return ref;
        },
        { behavior: 'immediate' },
      );
      this.events.emit('stock.changed', { variantIds: cart.lines.map((l) => l.variantId) });
      this.audit.record({
        actor: 'SYSTEM',
        action: 'order.created',
        entity: 'order',
        entityId: orderId,
        after: { channel: 'WEBSITE', totalMinor },
      });
      this.logger.info({ ref, totalMinor }, 'Website order created');
      return { orderId, ref, statusToken };
    } catch (err) {
      if (err instanceof OutOfStockError) {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'CART_CHANGED',
          'Someone just bought the last of an item in your cart.',
          undefined,
          undefined,
          this.storefront.priceCart({ items: input.items }),
        );
      }
      throw err;
    }
  }

  publicOrder(ref: string, token: string): PublicOrder {
    const { db, sqlite } = this.handle;
    const order = db.select().from(orders).where(eq(orders.ref, ref)).get();
    const given = Buffer.from(token ?? '');
    const expected = Buffer.from(order?.statusToken ?? 'x'.repeat(32));
    if (!order || given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        'NOT_FOUND',
        'We couldn’t find that order. Check the link you were sent.',
      );
    }
    const customer = db
      .select({ fullName: customers.fullName })
      .from(customers)
      .where(eq(customers.id, order.customerId))
      .get();
    const lines = sqlite
      .prepare(
        `select product_name_snapshot as name, variant_label_snapshot as variantLabel, quantity, line_total_minor as lineTotalMinor
         from order_items where order_id = ?`,
      )
      .all(order.id) as Array<{
      name: string;
      variantLabel: string;
      quantity: number;
      lineTotalMinor: number;
    }>;
    return {
      ref: order.ref,
      status: order.status,
      paymentStatus: order.paymentStatus,
      fulfilmentStatus: order.fulfilmentStatus,
      fulfilmentMethod: order.fulfilmentMethod,
      customerFirstName: customer?.fullName.split(' ')[0] ?? '',
      lines,
      subtotalMinor: order.subtotalMinor,
      deliveryFeeMinor: order.deliveryFeeMinor,
      totalMinor: order.totalMinor,
      currency: order.currency,
      reservedUntil:
        order.status === 'PENDING_PAYMENT'
          ? (order.reservationExpiresAt?.toISOString() ?? null)
          : null,
      paymentUrl:
        order.status === 'PENDING_PAYMENT' && order.paymentStatus !== 'PAID'
          ? this.payments.activePaymentUrl(order.id)
          : null,
      createdAt: order.createdAt.toISOString(),
    };
  }

  /** Releases stock held by unpaid orders whose reservation has run out (BUILD_PLAN D5). */
  expireUnpaid(now = new Date()) {
    const { db } = this.handle;
    const due = db
      .select({ id: orders.id, ref: orders.ref })
      .from(orders)
      .where(
        and(
          eq(orders.status, 'PENDING_PAYMENT'),
          inArray(orders.paymentStatus, ['UNPAID', 'LINK_CREATED', 'FAILED']),
          lt(orders.reservationExpiresAt, now),
        ),
      )
      .all();
    for (const o of due) {
      // Only expire if it is still unpaid at this moment; a payment may have just been verified.
      const changed = db
        .update(orders)
        .set({ status: 'EXPIRED' })
        .where(
          and(
            eq(orders.id, o.id),
            eq(orders.status, 'PENDING_PAYMENT'),
            sql`${orders.paymentStatus} != 'PAID'`,
          ),
        )
        .run().changes;
      if (changed) {
        this.inventory.release(o.id);
        this.audit.record({
          actor: 'SYSTEM',
          action: 'order.expired',
          entity: 'order',
          entityId: o.id,
        });
      }
    }
    if (due.length) this.logger.info({ count: due.length }, 'Expired unpaid orders');
    return due.length;
  }
}
