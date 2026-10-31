// Stock operations (BUILD_PLAN Phase 2). These functions are the only code that changes
// `inventory`. They are plain functions over a database handle (no Nest) so they can run inside
// a caller's transaction and in the multi-connection concurrency test.
//
// Correctness never depends on isolation levels (BUILD_PLAN D14): every change is a conditional
// UPDATE whose WHERE clause re-checks the invariant, and the database CHECK constraints
// (on_hand >= 0, 0 <= reserved <= on_hand) are the final backstop.
import { type DbLike, inventory, newId, orderItems, stockMovements } from '@snapsell/db';
import { and, eq, sql } from 'drizzle-orm';

type MovementReason = 'MANUAL_ADJUST' | 'RESERVE' | 'RELEASE' | 'SALE' | 'RETURN' | 'CORRECTION';

export interface Shortage {
  variantId: string;
  requested: number;
  available: number;
}

export type StockResult = { ok: true; changed: boolean } | { ok: false; shortages: Shortage[] };

class ShortageError extends Error {
  constructor(readonly shortages: Shortage[]) {
    super('Insufficient stock');
  }
}

export class StockAdjustmentError extends Error {
  constructor(
    readonly code: 'NOT_FOUND' | 'BELOW_RESERVED',
    message: string,
  ) {
    super(message);
  }
}

function available(db: DbLike, variantId: string) {
  const row = db
    .select({ onHand: inventory.onHand, reserved: inventory.reserved })
    .from(inventory)
    .where(eq(inventory.variantId, variantId))
    .get();
  return row ? row.onHand - row.reserved : 0;
}

/** Quantities per variant for an order, merging duplicate lines. */
function orderQuantities(db: DbLike, orderId: string) {
  return db
    .select({ variantId: orderItems.variantId, quantity: sql<number>`sum(${orderItems.quantity})` })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .groupBy(orderItems.variantId)
    .all();
}

/** Which movements already exist for an order, per variant – the basis of idempotency. */
function orderMovements(db: DbLike, orderId: string) {
  const rows = db
    .select({ variantId: stockMovements.variantId, reason: stockMovements.reason })
    .from(stockMovements)
    .where(eq(stockMovements.orderId, orderId))
    .all();
  const map = new Map<string, Set<MovementReason>>();
  for (const r of rows) {
    if (!map.has(r.variantId)) map.set(r.variantId, new Set());
    map.get(r.variantId)!.add(r.reason);
  }
  return map;
}

function recordMovement(
  db: DbLike,
  m: {
    variantId: string;
    deltaOnHand?: number;
    deltaReserved?: number;
    reason: MovementReason;
    note?: string | null;
    orderId?: string | null;
    userId?: string | null;
  },
) {
  db.insert(stockMovements)
    .values({
      id: newId(),
      variantId: m.variantId,
      deltaOnHand: m.deltaOnHand ?? 0,
      deltaReserved: m.deltaReserved ?? 0,
      reason: m.reason,
      note: m.note ?? null,
      orderId: m.orderId ?? null,
      userId: m.userId ?? null,
    })
    .run();
}

/**
 * Manual change to the stock on hand. `delta` may be negative but never takes on-hand below
 * what is reserved for open orders.
 */
export function adjustStock(
  db: DbLike,
  input: {
    variantId: string;
    delta: number;
    reason: MovementReason;
    note?: string | null;
    userId?: string | null;
  },
) {
  return db.transaction(
    (tx) => {
      if (input.delta === 0) return;
      const changed = tx
        .update(inventory)
        .set({ onHand: sql`${inventory.onHand} + ${input.delta}`, updatedAt: new Date() })
        .where(
          and(
            eq(inventory.variantId, input.variantId),
            sql`${inventory.onHand} + ${input.delta} >= ${inventory.reserved}`,
          ),
        )
        .run().changes;
      if (changed === 0) {
        const exists = tx
          .select()
          .from(inventory)
          .where(eq(inventory.variantId, input.variantId))
          .get();
        if (!exists) throw new StockAdjustmentError('NOT_FOUND', 'Variant not found');
        throw new StockAdjustmentError(
          'BELOW_RESERVED',
          `Only ${exists.onHand - exists.reserved} can be removed; ${exists.reserved} are reserved for open orders.`,
        );
      }
      recordMovement(tx, { ...input, deltaOnHand: input.delta });
    },
    { behavior: 'immediate' },
  );
}

/**
 * Reserves stock for every line of an order, all or nothing. Calling it again for the same
 * order is a no-op.
 */
export function reserveOrder(db: DbLike, orderId: string): StockResult {
  try {
    return db.transaction(
      (tx) => {
        const done = orderMovements(tx, orderId);
        const lines = orderQuantities(tx, orderId).filter(
          (l) => !done.get(l.variantId)?.has('RESERVE'),
        );
        const shortages: Shortage[] = [];
        for (const { variantId, quantity } of lines) {
          const changed = tx
            .update(inventory)
            .set({ reserved: sql`${inventory.reserved} + ${quantity}`, updatedAt: new Date() })
            .where(
              and(
                eq(inventory.variantId, variantId),
                sql`${inventory.onHand} - ${inventory.reserved} >= ${quantity}`,
              ),
            )
            .run().changes;
          if (changed === 0) {
            shortages.push({ variantId, requested: quantity, available: available(tx, variantId) });
            continue;
          }
          recordMovement(tx, { variantId, deltaReserved: quantity, reason: 'RESERVE', orderId });
        }
        // Throwing rolls back the reservations made above.
        if (shortages.length) throw new ShortageError(shortages);
        return { ok: true as const, changed: lines.length > 0 };
      },
      { behavior: 'immediate' },
    );
  } catch (err) {
    if (err instanceof ShortageError) return { ok: false, shortages: err.shortages };
    throw err;
  }
}

/** Returns reserved stock (order cancelled or expired). Safe to call repeatedly. */
export function releaseOrder(db: DbLike, orderId: string): StockResult {
  return db.transaction(
    (tx) => {
      const done = orderMovements(tx, orderId);
      let changed = false;
      for (const { variantId, quantity } of orderQuantities(tx, orderId)) {
        const reasons = done.get(variantId);
        if (!reasons?.has('RESERVE') || reasons.has('RELEASE') || reasons.has('SALE')) continue;
        tx.update(inventory)
          .set({ reserved: sql`${inventory.reserved} - ${quantity}`, updatedAt: new Date() })
          .where(eq(inventory.variantId, variantId))
          .run();
        recordMovement(tx, { variantId, deltaReserved: -quantity, reason: 'RELEASE', orderId });
        changed = true;
      }
      return { ok: true as const, changed };
    },
    { behavior: 'immediate' },
  );
}

/**
 * Turns an order's reservation into a sale after a verified payment. If the reservation was
 * already released (a late payment), the sale is taken from available stock instead and may
 * report a shortage. Calling it again for the same order is a no-op.
 */
export function commitOrderSale(db: DbLike, orderId: string): StockResult {
  try {
    return db.transaction(
      (tx) => {
        const done = orderMovements(tx, orderId);
        const shortages: Shortage[] = [];
        let changed = false;
        for (const { variantId, quantity } of orderQuantities(tx, orderId)) {
          const reasons = done.get(variantId) ?? new Set<MovementReason>();
          if (reasons.has('SALE')) continue;
          const reservedForOrder = reasons.has('RESERVE') && !reasons.has('RELEASE');
          const result = reservedForOrder
            ? tx
                .update(inventory)
                .set({
                  onHand: sql`${inventory.onHand} - ${quantity}`,
                  reserved: sql`${inventory.reserved} - ${quantity}`,
                  updatedAt: new Date(),
                })
                .where(eq(inventory.variantId, variantId))
                .run()
            : tx
                .update(inventory)
                .set({ onHand: sql`${inventory.onHand} - ${quantity}`, updatedAt: new Date() })
                .where(
                  and(
                    eq(inventory.variantId, variantId),
                    sql`${inventory.onHand} - ${inventory.reserved} >= ${quantity}`,
                  ),
                )
                .run();
          if (result.changes === 0) {
            shortages.push({ variantId, requested: quantity, available: available(tx, variantId) });
            continue;
          }
          recordMovement(tx, {
            variantId,
            deltaOnHand: -quantity,
            deltaReserved: reservedForOrder ? -quantity : 0,
            reason: 'SALE',
            orderId,
          });
          changed = true;
        }
        if (shortages.length) throw new ShortageError(shortages);
        return { ok: true as const, changed };
      },
      { behavior: 'immediate' },
    );
  } catch (err) {
    if (err instanceof ShortageError) return { ok: false, shortages: err.shortages };
    throw err;
  }
}
