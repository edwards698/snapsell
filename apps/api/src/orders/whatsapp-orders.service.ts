import { createHash } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  businessSettings,
  counters,
  customers,
  type DatabaseHandle,
  type DbLike,
  inventory,
  newId,
  orderItems,
  orders,
  productVariants,
  products,
  quotes,
} from '@snapsell/db';
import { formatMoney, MAX_LINE_QUANTITY, variantLabel } from '@snapsell/shared';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { type Logger } from 'pino';
import { isExplicitAffirmative } from '../ai/affirmative.js';
import { quoteHash, type QuoteSnapshot, renderQuoteSummary } from '../ai/quote-summary.js';
import { AuditService } from '../common/audit.service.js';
import { ApiError } from '../common/errors.js';
import { EventBus } from '../common/events.js';
import { reserveOrder } from '../catalog/inventory-ops.js';
import { DATABASE } from '../database/database.module.js';
import { LOGGER } from '../logging/logging.module.js';
import { PaymentsService } from '../payments/payments.service.js';
import { StorefrontService } from '../store/storefront.service.js';

export interface DraftItemInput {
  variantId: string;
  quantity: number;
}

export interface DraftUpdateInput {
  items?: DraftItemInput[];
  fulfilmentMethod?: 'DELIVERY' | 'COLLECTION';
  address?: {
    line1: string;
    line2?: string;
    area?: string;
    city?: string;
    notes?: string;
  } | null;
  customerName?: string;
}

class OutOfStockError extends Error {}

function nextOrderRef(db: DbLike) {
  const row = db
    .insert(counters)
    .values({ name: 'order_ref', value: 1 })
    .onConflictDoUpdate({ target: counters.name, set: { value: sql`${counters.value} + 1` } })
    .returning({ value: counters.value })
    .get();
  return `ORD-${String(row.value).padStart(5, '0')}`;
}

/** WhatsApp drafts, quotes and confirmation — same stock and payments as the website (Phase 7). */
@Injectable()
export class WhatsAppOrdersService {
  constructor(
    @Inject(DATABASE) private readonly handle: DatabaseHandle,
    @Inject(LOGGER) private readonly logger: Logger,
    private readonly storefront: StorefrontService,
    private readonly payments: PaymentsService,
    private readonly events: EventBus,
    private readonly audit: AuditService,
  ) {}

  /** Active DRAFT or PENDING_CONFIRMATION order for this conversation, if any. */
  draftFor(conversationId: string) {
    return this.handle.db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.conversationId, conversationId),
          inArray(orders.status, ['DRAFT', 'PENDING_CONFIRMATION']),
        ),
      )
      .orderBy(desc(orders.createdAt))
      .get();
  }

  createOrUpdateDraft(
    conversationId: string,
    customerId: string,
    input: DraftUpdateInput,
    opts: { create: boolean },
  ) {
    const { db } = this.handle;
    const settings = this.storefront.settings();
    let draft = this.draftFor(conversationId);

    if (!draft && !opts.create) {
      return { error: 'No draft order for this conversation. Call create_draft_order first.' };
    }
    if (!draft) {
      const orderId = newId();
      const statusToken = createHash('sha256').update(orderId).digest('base64url').slice(0, 32);
      const ref = db.transaction((tx) => {
        const r = nextOrderRef(tx);
        tx.insert(orders)
          .values({
            id: orderId,
            ref: r,
            channel: 'WHATSAPP',
            customerId,
            status: 'DRAFT',
            paymentStatus: 'UNPAID',
            fulfilmentStatus: 'UNFULFILLED',
            fulfilmentMethod: null,
            deliveryAddress: null,
            subtotalMinor: 0,
            deliveryFeeMinor: 0,
            totalMinor: 0,
            currency: settings.currency,
            conversationId,
            statusToken,
            idempotencyKey: `wa-draft:${conversationId}:${orderId}`,
          })
          .run();
        return r;
      });
      draft = db.select().from(orders).where(eq(orders.id, orderId)).get()!;
      this.audit.record({
        actor: 'AI',
        action: 'order.draft_created',
        entity: 'order',
        entityId: orderId,
        after: { channel: 'WHATSAPP', ref },
      });
    }

    if (draft.status !== 'DRAFT' && draft.status !== 'PENDING_CONFIRMATION') {
      return { error: 'This conversation already has a confirmed or closed order.' };
    }

    // Editing after a quote was shown returns the order to DRAFT so the customer must re-approve.
    if (draft.status === 'PENDING_CONFIRMATION' && (input.items || input.fulfilmentMethod || input.address)) {
      db.update(orders)
        .set({ status: 'DRAFT', quoteId: null })
        .where(eq(orders.id, draft.id))
        .run();
      draft = { ...draft, status: 'DRAFT', quoteId: null };
    }

    if (input.customerName?.trim()) {
      db.update(customers)
        .set({ fullName: input.customerName.trim() })
        .where(eq(customers.id, customerId))
        .run();
    }

    if (input.fulfilmentMethod) {
      if (input.fulfilmentMethod === 'DELIVERY' && !settings.deliveryEnabled) {
        return { error: 'Delivery is not available.' };
      }
      if (input.fulfilmentMethod === 'COLLECTION' && !settings.collectionEnabled) {
        return { error: 'Collection is not available.' };
      }
      db.update(orders)
        .set({
          fulfilmentMethod: input.fulfilmentMethod,
          deliveryAddress:
            input.fulfilmentMethod === 'COLLECTION'
              ? null
              : (input.address ?? draft.deliveryAddress),
        })
        .where(eq(orders.id, draft.id))
        .run();
    } else if (input.address && draft.fulfilmentMethod === 'DELIVERY') {
      db.update(orders)
        .set({ deliveryAddress: input.address })
        .where(eq(orders.id, draft.id))
        .run();
    }

    if (input.items) {
      const priced = this.priceItems(input.items);
      if ('error' in priced) return priced;
      db.transaction((tx) => {
        tx.delete(orderItems).where(eq(orderItems.orderId, draft!.id)).run();
        tx.insert(orderItems)
          .values(
            priced.lines.map((l) => ({
              id: newId(),
              orderId: draft!.id,
              variantId: l.variantId,
              productNameSnapshot: l.name,
              variantLabelSnapshot: l.variantLabel === 'Default' ? '' : l.variantLabel,
              skuSnapshot: l.sku,
              unitPriceMinor: l.unitPriceMinor,
              quantity: l.quantity,
              lineTotalMinor: l.lineTotalMinor,
            })),
          )
          .run();
        tx.update(orders)
          .set({
            subtotalMinor: priced.subtotalMinor,
            currency: priced.currency,
            totalMinor: priced.subtotalMinor,
            status: 'DRAFT',
            quoteId: null,
          })
          .where(eq(orders.id, draft!.id))
          .run();
      });
    }

    return this.draftView(draft.id);
  }

  /**
   * Re-prices the draft, creates a quote, and returns the backend-rendered summary.
   * The assistant must include `summary` unchanged in the customer-facing reply.
   */
  calculate(conversationId: string, draftId: string) {
    const { db } = this.handle;
    const draft = db.select().from(orders).where(eq(orders.id, draftId)).get();
    if (!draft || draft.conversationId !== conversationId) {
      return { error: 'Draft not found for this conversation.' };
    }
    if (draft.status !== 'DRAFT' && draft.status !== 'PENDING_CONFIRMATION') {
      return { error: 'Only a draft can be calculated.' };
    }
    const settings = this.storefront.settings();
    const shop = db.select().from(businessSettings).get()!;
    const lines = this.loadLines(draft.id);
    if (lines.length === 0) return { error: 'Add at least one item before calculating.' };
    if (!draft.fulfilmentMethod) {
      return { error: 'Ask whether the customer wants delivery or collection first.' };
    }
    if (draft.fulfilmentMethod === 'DELIVERY') {
      if (!settings.deliveryEnabled) return { error: 'Delivery is not available.' };
      if (!draft.deliveryAddress?.line1) {
        return { error: 'Ask for the delivery address before calculating.' };
      }
    }
    const priced = this.priceItems(
      lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
    );
    if ('error' in priced) return priced;
    for (const line of priced.lines) {
      if (line.available < line.quantity) {
        return {
          error: `Not enough stock for ${line.name}. Available: ${line.available}.`,
          changed: true,
        };
      }
    }
    const deliveryFeeMinor =
      draft.fulfilmentMethod === 'DELIVERY' ? settings.deliveryFeeMinor : 0;
    const fees: Record<string, number> = deliveryFeeMinor > 0 ? { delivery: deliveryFeeMinor } : {};
    const totalMinor = priced.subtotalMinor + deliveryFeeMinor;
    const snapshot: QuoteSnapshot = {
      items: priced.lines.map((l) => ({
        variantId: l.variantId,
        name: l.name,
        quantity: l.quantity,
        unitPriceMinor: l.unitPriceMinor,
        lineTotalMinor: l.lineTotalMinor,
      })),
      fees,
      totalMinor,
      currency: priced.currency,
      fulfilment: draft.fulfilmentMethod,
    };
    const hash = quoteHash(snapshot);
    const summary = renderQuoteSummary(snapshot, shop.name);
    const quoteId = newId();
    const draftTtl = shop.draftTtlMinutes || 1440;
    db.transaction((tx) => {
      tx.delete(orderItems).where(eq(orderItems.orderId, draft.id)).run();
      tx.insert(orderItems)
        .values(
          priced.lines.map((l) => ({
            id: newId(),
            orderId: draft.id,
            variantId: l.variantId,
            productNameSnapshot: l.name,
            variantLabelSnapshot: l.variantLabel === 'Default' ? '' : l.variantLabel,
            skuSnapshot: l.sku,
            unitPriceMinor: l.unitPriceMinor,
            quantity: l.quantity,
            lineTotalMinor: l.lineTotalMinor,
          })),
        )
        .run();
      tx.insert(quotes)
        .values({
          id: quoteId,
          conversationId,
          items: snapshot.items,
          fees: snapshot.fees,
          totalMinor,
          currency: snapshot.currency,
          hash,
          expiresAt: new Date(Date.now() + draftTtl * 60_000),
        })
        .run();
      tx.update(orders)
        .set({
          status: 'PENDING_CONFIRMATION',
          subtotalMinor: priced.subtotalMinor,
          deliveryFeeMinor,
          totalMinor,
          currency: priced.currency,
          quoteId,
        })
        .where(eq(orders.id, draft.id))
        .run();
    });
    return {
      draft_id: draft.id,
      quote_id: quoteId,
      order_ref: draft.ref,
      total: formatMoney(totalMinor, priced.currency, { trimZeros: true }),
      summary,
      note: 'Send the summary block to the customer unchanged, then ask them to confirm.',
    };
  }

  /**
   * Confirms a presented quote after an explicit customer yes. Idempotent on quote_id.
   */
  confirm(conversationId: string, quoteId: string, customerMessage: string) {
    const { db } = this.handle;
    const quote = db.select().from(quotes).where(eq(quotes.id, quoteId)).get();
    if (!quote || quote.conversationId !== conversationId) {
      return { error: 'Quote not found for this conversation.' };
    }
    if (quote.consumedAt) {
      const order = db.select().from(orders).where(eq(orders.quoteId, quoteId)).get();
      return {
        ok: true,
        alreadyConfirmed: true,
        order_ref: order?.ref,
        status: order?.status,
      };
    }
    if (!quote.presentedMessageId) {
      return {
        error:
          'The order summary has not been sent to the customer yet. Send the summary first, then wait for their yes.',
      };
    }
    if (quote.expiresAt.getTime() < Date.now()) {
      return { error: 'This quote has expired. Call calculate_order again.' };
    }
    if (!isExplicitAffirmative(customerMessage)) {
      return {
        error:
          'That is not a clear confirmation. Ask again for a simple yes, without changes or questions.',
        needClarification: true,
      };
    }

    const order = db
      .select()
      .from(orders)
      .where(and(eq(orders.quoteId, quoteId), eq(orders.conversationId, conversationId)))
      .get();
    if (!order) return { error: 'No order is tied to this quote.' };
    if (order.status === 'PENDING_PAYMENT' || order.status === 'CONFIRMED') {
      return { ok: true, alreadyConfirmed: true, order_ref: order.ref, status: order.status };
    }

    const settings = this.storefront.settings();
    const lines = this.loadLines(order.id);
    const priced = this.priceItems(
      lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
    );
    if ('error' in priced) return priced;
    const deliveryFeeMinor =
      order.fulfilmentMethod === 'DELIVERY' ? settings.deliveryFeeMinor : 0;
    const fees: Record<string, number> = deliveryFeeMinor > 0 ? { delivery: deliveryFeeMinor } : {};
    const totalMinor = priced.subtotalMinor + deliveryFeeMinor;
    const snapshot: QuoteSnapshot = {
      items: priced.lines.map((l) => ({
        variantId: l.variantId,
        name: l.name,
        quantity: l.quantity,
        unitPriceMinor: l.unitPriceMinor,
        lineTotalMinor: l.lineTotalMinor,
      })),
      fees,
      totalMinor,
      currency: priced.currency,
      fulfilment: (order.fulfilmentMethod ?? 'COLLECTION') as 'DELIVERY' | 'COLLECTION',
    };
    if (quoteHash(snapshot) !== quote.hash) {
      const recalc = this.calculate(conversationId, order.id);
      return {
        changed: true,
        error: 'Price or stock changed since the summary. A new summary is ready for re-approval.',
        ...('summary' in recalc ? recalc : {}),
      };
    }
    for (const line of priced.lines) {
      if (line.available < line.quantity) {
        const recalc = this.calculate(conversationId, order.id);
        return {
          changed: true,
          error: `Not enough stock for ${line.name}.`,
          ...('summary' in recalc ? recalc : {}),
        };
      }
    }

    try {
      db.transaction(
        (tx) => {
          const consumed = tx
            .update(quotes)
            .set({ consumedAt: new Date() })
            .where(and(eq(quotes.id, quoteId), isNull(quotes.consumedAt)))
            .run().changes;
          if (!consumed) return;
          tx.update(orders)
            .set({
              status: 'PENDING_PAYMENT',
              subtotalMinor: priced.subtotalMinor,
              deliveryFeeMinor,
              totalMinor,
              currency: priced.currency,
              reservationExpiresAt: new Date(
                Date.now() + settings.reservationTtlMinutes * 60_000,
              ),
            })
            .where(eq(orders.id, order.id))
            .run();
          if (!reserveOrder(tx, order.id).ok) throw new OutOfStockError();
        },
        { behavior: 'immediate' },
      );
    } catch (err) {
      if (err instanceof OutOfStockError) {
        const recalc = this.calculate(conversationId, order.id);
        return {
          changed: true,
          error: 'Stock ran out while confirming. A new summary is ready.',
          ...('summary' in recalc ? recalc : {}),
        };
      }
      throw err;
    }

    this.events.emit('stock.changed', {
      variantIds: priced.lines.map((l) => l.variantId),
    });
    this.audit.record({
      actor: 'AI',
      action: 'order.confirmed',
      entity: 'order',
      entityId: order.id,
      after: { quoteId, totalMinor },
    });
    this.logger.info({ ref: order.ref, quoteId }, 'WhatsApp order confirmed');
    return {
      ok: true,
      order_ref: order.ref,
      status: 'PENDING_PAYMENT',
      total: formatMoney(totalMinor, priced.currency, { trimZeros: true }),
      next: 'Call generate_payment_link with this order_ref.',
    };
  }

  async generatePaymentLink(
    conversationId: string,
    orderRef: string,
    opts: { autoSend: boolean },
  ) {
    const { db } = this.handle;
    const order = db
      .select()
      .from(orders)
      .where(and(eq(orders.ref, orderRef), eq(orders.conversationId, conversationId)))
      .get();
    if (!order) return { error: 'No order with that reference for this conversation.' };
    if (order.status !== 'PENDING_PAYMENT') {
      return { error: 'Payment links are only created for confirmed orders awaiting payment.' };
    }
    if (order.paymentStatus === 'PAID') return { error: 'This order is already paid.' };

    try {
      const result = await this.payments.createLinkForOrder(order.id, { type: 'SYSTEM' });
      const url = this.payments.activePaymentUrl(order.id);
      if (!url) return { error: 'The payment link was created but no customer URL is available.' };
      if (!opts.autoSend) {
        db.update(orders).set({ needsAttention: true }).where(eq(orders.id, order.id)).run();
        return {
          order_ref: order.ref,
          payment_url: url,
          awaiting_owner: true,
          message:
            'Payment link is ready. The owner must approve sending it (auto-send is off). Do not invent a different URL.',
        };
      }
      const body = [
        `Thank you! Your order *${order.ref}* is ready to pay.`,
        `Total: *${formatMoney(order.totalMinor, order.currency, { trimZeros: true })}*`,
        '',
        'Pay securely here:',
        url,
        '',
        'We will confirm once the payment provider verifies it. A screenshot or “I have paid” is not enough.',
      ].join('\n');
      return {
        order_ref: order.ref,
        payment_url: url,
        payment_message: body,
        note: 'Send payment_message to the customer unchanged.',
      };
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not create a payment link.';
      return { error: message };
    }
  }

  /** Marks a quote as presented when the outbound AI message that contains its summary is stored. */
  markPresented(conversationId: string, messageId: string, reply: string) {
    const { db } = this.handle;
    const open = db
      .select()
      .from(quotes)
      .where(
        and(
          eq(quotes.conversationId, conversationId),
          isNull(quotes.consumedAt),
          isNull(quotes.presentedMessageId),
        ),
      )
      .orderBy(desc(quotes.createdAt))
      .get();
    if (!open) return null;
    const shop = db.select().from(businessSettings).get()!;
    const snapshot: QuoteSnapshot = {
      items: open.items,
      fees: open.fees,
      totalMinor: open.totalMinor,
      currency: open.currency,
      fulfilment: this.draftFor(conversationId)?.fulfilmentMethod === 'DELIVERY' ? 'DELIVERY' : 'COLLECTION',
    };
    // Prefer matching against the stored hash via re-render from quote rows.
    const order = db.select().from(orders).where(eq(orders.quoteId, open.id)).get();
    const fulfilment =
      (order?.fulfilmentMethod as 'DELIVERY' | 'COLLECTION' | null) ?? snapshot.fulfilment;
    const summary = renderQuoteSummary({ ...snapshot, fulfilment }, shop.name);
    if (!reply.includes(summary)) return null;
    db.update(quotes)
      .set({ presentedMessageId: messageId })
      .where(eq(quotes.id, open.id))
      .run();
    return { quoteId: open.id, summary };
  }

  latestUnconsumedQuote(conversationId: string) {
    return this.handle.db
      .select()
      .from(quotes)
      .where(and(eq(quotes.conversationId, conversationId), isNull(quotes.consumedAt)))
      .orderBy(desc(quotes.createdAt))
      .get();
  }

  private draftView(orderId: string) {
    const order = this.handle.db.select().from(orders).where(eq(orders.id, orderId)).get()!;
    const lines = this.loadLines(orderId);
    return {
      draft_id: order.id,
      order_ref: order.ref,
      status: order.status,
      fulfilment_method: order.fulfilmentMethod,
      address: order.deliveryAddress,
      items: lines.map((l) => ({
        variant_id: l.variantId,
        name: l.name,
        quantity: l.quantity,
        unit_price: formatMoney(l.unitPriceMinor, order.currency, { trimZeros: true }),
        line_total: formatMoney(l.lineTotalMinor, order.currency, { trimZeros: true }),
      })),
      subtotal: formatMoney(order.subtotalMinor, order.currency, { trimZeros: true }),
    };
  }

  private loadLines(orderId: string) {
    return this.handle.db
      .select({
        variantId: orderItems.variantId,
        name: orderItems.productNameSnapshot,
        quantity: orderItems.quantity,
        unitPriceMinor: orderItems.unitPriceMinor,
        lineTotalMinor: orderItems.lineTotalMinor,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId))
      .all();
  }

  private priceItems(items: DraftItemInput[]) {
    if (items.length === 0) return { error: 'Add at least one item.' } as const;
    const cleaned: DraftItemInput[] = [];
    for (const item of items) {
      if (!item.variantId || !Number.isInteger(item.quantity) || item.quantity < 1) {
        return { error: 'Each item needs a variant_id and a positive quantity.' } as const;
      }
      if (item.quantity > MAX_LINE_QUANTITY) {
        return { error: `Quantity cannot exceed ${MAX_LINE_QUANTITY}.` } as const;
      }
      cleaned.push(item);
    }
    const { db } = this.handle;
    const lines: Array<{
      variantId: string;
      name: string;
      variantLabel: string;
      sku: string;
      quantity: number;
      unitPriceMinor: number;
      lineTotalMinor: number;
      currency: string;
      available: number;
    }> = [];
    let currency = this.storefront.settings().currency;
    let subtotalMinor = 0;
    for (const item of cleaned) {
      const row = db
        .select({
          v: productVariants,
          p: products,
          i: inventory,
        })
        .from(productVariants)
        .innerJoin(products, eq(products.id, productVariants.productId))
        .innerJoin(inventory, eq(inventory.variantId, productVariants.id))
        .where(and(eq(productVariants.id, item.variantId), eq(products.status, 'ACTIVE')))
        .get();
      if (!row) return { error: `Unknown or inactive variant ${item.variantId}.` } as const;
      const available = row.i.onHand - row.i.reserved;
      const label = variantLabel(row.p.optionNames, row.v.optionValues);
      const name = label === 'Default' ? row.p.name : `${row.p.name} (${label})`;
      const lineTotalMinor = row.v.priceMinor * item.quantity;
      currency = row.v.currency;
      subtotalMinor += lineTotalMinor;
      lines.push({
        variantId: row.v.id,
        name,
        variantLabel: label,
        sku: row.v.sku,
        quantity: item.quantity,
        unitPriceMinor: row.v.priceMinor,
        lineTotalMinor,
        currency: row.v.currency,
        available,
      });
    }
    return { lines, subtotalMinor, currency } as const;
  }
}
