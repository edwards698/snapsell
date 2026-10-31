import { customers, type DbLike, newId, orderItems, orders, productVariants } from '@snapsell/db';
import { eq } from 'drizzle-orm';

/** Inserts a minimal order with the given lines (orders are created by checkout from Phase 3). */
export function createOrder(db: DbLike, lines: Array<{ variantId: string; quantity: number }>) {
  const customerId = newId();
  db.insert(customers)
    .values({
      id: customerId,
      fullName: 'Test Customer',
      phoneE164: `+26097${Math.floor(Math.random() * 1e7)
        .toString()
        .padStart(7, '0')}`,
    })
    .run();
  const orderId = newId();
  db.insert(orders)
    .values({
      id: orderId,
      ref: `T-${orderId}`,
      channel: 'WEBSITE',
      customerId,
      status: 'PENDING_PAYMENT',
      currency: 'ZMW',
      statusToken: newId(),
      idempotencyKey: newId(),
    })
    .run();
  for (const line of lines) {
    const v = db
      .select()
      .from(productVariants)
      .where(eq(productVariants.id, line.variantId))
      .get()!;
    db.insert(orderItems)
      .values({
        id: newId(),
        orderId,
        variantId: line.variantId,
        productNameSnapshot: 'Test',
        skuSnapshot: v.sku,
        unitPriceMinor: v.priceMinor,
        quantity: line.quantity,
        lineTotalMinor: v.priceMinor * line.quantity,
      })
      .run();
  }
  return orderId;
}
