import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  auditLogs,
  customers,
  type DatabaseHandle,
  orderItems,
  orders,
  payments,
  productVariants,
  webhookEvents,
} from '@snapsell/db';
import {
  type CancelOrderInput,
  cancelOrderSchema,
  type CustomerListItem,
  customerListQuerySchema,
  type DashboardStats,
  formatPhone,
  type FulfilmentStatus,
  type OrderDetail,
  type OrderListItem,
  type OrderListQuery,
  orderListQuerySchema,
  type Paginated,
  type PaymentDto,
  type TimelineEntry,
  type WebhookEventDto,
} from '@snapsell/shared';
import { and, asc, desc, eq } from 'drizzle-orm';
import { type z } from 'zod';
import { AuditService } from '../common/audit.service.js';
import { ApiError } from '../common/errors.js';
import { EventBus } from '../common/events.js';
import { adjustStock, releaseOrder } from '../catalog/inventory-ops.js';
import { APP_CONFIG } from '../config/config.module.js';
import { type AppConfig } from '../config/config.js';
import { DATABASE } from '../database/database.module.js';
import { PaymentsService } from '../payments/payments.service.js';

type OrderRow = typeof orders.$inferSelect;

/** Allowed fulfilment moves (spec §3.6); only paid orders are fulfilled. */
function nextSteps(
  o: Pick<OrderRow, 'paymentStatus' | 'status' | 'fulfilmentStatus' | 'fulfilmentMethod'>,
): FulfilmentStatus[] {
  if (o.paymentStatus !== 'PAID' || o.status === 'CANCELLED' || o.status === 'COMPLETED') return [];
  switch (o.fulfilmentStatus) {
    case 'UNFULFILLED':
      return ['PROCESSING'];
    case 'PROCESSING':
      return o.fulfilmentMethod === 'DELIVERY' ? ['DISPATCHED'] : ['READY_FOR_COLLECTION'];
    case 'READY_FOR_COLLECTION':
    case 'DISPATCHED':
      return ['DELIVERED'];
    default:
      return [];
  }
}

const ACTION_LABELS: Record<string, string> = {
  'order.created': 'Order placed',
  'payment.link_created': 'Payment link created',
  'payment.link_failed': 'Payment link failed',
  'payment.completed': 'Payment verified',
  'payment.failed': 'Payment failed',
  'payment.mismatch': 'Payment amount didn’t match – ignored',
  'order.fulfilment': 'Fulfilment updated',
  'order.cancelled': 'Order cancelled',
  'order.expired': 'Reservation expired – stock released',
  'order.attention_resolved': 'Marked as handled',
};

const FULFILMENT_LABEL: Record<string, string> = {
  PROCESSING: 'Preparing',
  READY_FOR_COLLECTION: 'Ready for collection',
  DISPATCHED: 'Out for delivery',
  DELIVERED: 'Delivered',
};

@Injectable()
export class OrdersAdminService {
  constructor(
    @Inject(DATABASE) private readonly handle: DatabaseHandle,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly payments: PaymentsService,
    private readonly audit: AuditService,
    private readonly events: EventBus,
  ) {}

  list(query: OrderListQuery): Paginated<OrderListItem> {
    const q = orderListQuerySchema.parse(query);
    const where: string[] = [`o.status != 'DRAFT'`];
    const params: Record<string, unknown> = {};
    const views: Record<string, string> = {
      unpaid: `o.status = 'PENDING_PAYMENT' and o.payment_status != 'PAID'`,
      to_fulfil: `o.payment_status = 'PAID' and o.status = 'CONFIRMED'`,
      completed: `o.status = 'COMPLETED'`,
      closed: `o.status in ('CANCELLED', 'EXPIRED')`,
      attention: 'o.needs_attention = 1',
    };
    if (views[q.view]) where.push(views[q.view]!);
    if (q.channel !== 'all') {
      where.push('o.channel = @channel');
      params.channel = q.channel;
    }
    if (q.range !== 'all') {
      const days = q.range === 'today' ? 0 : q.range === '7d' ? 7 : 30;
      const from = new Date();
      from.setHours(0, 0, 0, 0);
      from.setDate(from.getDate() - days);
      where.push('o.created_at >= @from');
      params.from = from.getTime();
    }
    if (q.customerId) {
      where.push('o.customer_id = @customerId');
      params.customerId = q.customerId;
    }
    if (q.q) {
      where.push(`(o.ref like @like or c.full_name like @like or c.phone_e164 like @phoneLike)`);
      params.like = `%${q.q}%`;
      params.phoneLike = `%${q.q.replace(/\D/g, '').replace(/^0/, '') || q.q}%`;
    }
    const from = `from orders o join customers c on c.id = o.customer_id where ${where.join(' and ')}`;
    const { sqlite } = this.handle;
    const total = (sqlite.prepare(`select count(*) as n ${from}`).get(params) as { n: number }).n;
    const rows = sqlite
      .prepare(
        `select o.*, c.full_name, c.phone_e164,
                (select coalesce(sum(quantity), 0) from order_items where order_id = o.id) as item_count
         ${from} order by o.created_at desc limit @limit offset @offset`,
      )
      .all({ ...params, limit: q.pageSize, offset: (q.page - 1) * q.pageSize }) as Array<
      Record<string, unknown>
    >;
    return {
      total,
      page: q.page,
      pageSize: q.pageSize,
      items: rows.map((r) => ({
        id: r.id as string,
        ref: r.ref as string,
        channel: r.channel as OrderListItem['channel'],
        customer: {
          id: r.customer_id as string,
          name: r.full_name as string,
          phone: formatPhone(r.phone_e164 as string),
        },
        itemCount: r.item_count as number,
        totalMinor: r.total_minor as number,
        currency: r.currency as string,
        status: r.status as OrderListItem['status'],
        paymentStatus: r.payment_status as OrderListItem['paymentStatus'],
        fulfilmentStatus: r.fulfilment_status as OrderListItem['fulfilmentStatus'],
        fulfilmentMethod: r.fulfilment_method as OrderListItem['fulfilmentMethod'],
        needsAttention: !!r.needs_attention,
        createdAt: new Date(r.created_at as number).toISOString(),
      })),
    };
  }

  get(ref: string): OrderDetail {
    const { db } = this.handle;
    const o = this.find(ref);
    const customer = db.select().from(customers).where(eq(customers.id, o.customerId)).get()!;
    const items = db
      .select({ i: orderItems, productId: productVariants.productId })
      .from(orderItems)
      .leftJoin(productVariants, eq(productVariants.id, orderItems.variantId))
      .where(eq(orderItems.orderId, o.id))
      .all()
      .map(({ i, productId }) => ({
        id: i.id,
        variantId: i.variantId,
        productId,
        name: i.productNameSnapshot,
        variantLabel: i.variantLabelSnapshot,
        sku: i.skuSnapshot,
        unitPriceMinor: i.unitPriceMinor,
        quantity: i.quantity,
        lineTotalMinor: i.lineTotalMinor,
      }));
    const paymentRows = db
      .select()
      .from(payments)
      .where(eq(payments.orderId, o.id))
      .orderBy(desc(payments.createdAt))
      .all();
    const hooks = this.webhookEventsFor(o.id, o.ref);
    const timeline: TimelineEntry[] = db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entity, 'order'), eq(auditLogs.entityId, o.id)))
      .orderBy(asc(auditLogs.createdAt))
      .all()
      .map((a) => {
        const after = (a.after ?? {}) as Record<string, unknown>;
        let detail: string | null = null;
        if (a.action === 'order.fulfilment')
          detail = FULFILMENT_LABEL[after.status as string] ?? null;
        if (a.action === 'order.cancelled') detail = (after.reason as string) || null;
        if (a.action === 'payment.link_failed') detail = (after.error as string) ?? null;
        return {
          at: a.createdAt.toISOString(),
          action: a.action,
          label: ACTION_LABELS[a.action] ?? a.action,
          actor: a.actor,
          detail,
        };
      });
    const base = this.toListItem(
      o,
      customer,
      items.reduce((n, i) => n + i.quantity, 0),
    );
    return {
      ...base,
      deliveryAddress: o.deliveryAddress,
      notes: o.notes,
      items,
      subtotalMinor: o.subtotalMinor,
      deliveryFeeMinor: o.deliveryFeeMinor,
      discountMinor: o.discountMinor,
      reservationExpiresAt:
        o.status === 'PENDING_PAYMENT' ? (o.reservationExpiresAt?.toISOString() ?? null) : null,
      statusUrl: `${this.config.publicWebUrl}/order/${o.ref}?t=${encodeURIComponent(o.statusToken)}`,
      payments: paymentRows.map((p) => this.paymentDto(p, o.ref)),
      webhookEvents: hooks,
      timeline,
      nextSteps: nextSteps(o),
      canCancel: o.status === 'PENDING_PAYMENT' || o.status === 'CONFIRMED',
      canCreatePaymentLink: o.status === 'PENDING_PAYMENT' && o.paymentStatus !== 'PAID',
    };
  }

  setFulfilment(ref: string, status: FulfilmentStatus, actorId: string) {
    const o = this.find(ref);
    if (!nextSteps(o).includes(status)) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'INVALID_TRANSITION',
        o.paymentStatus !== 'PAID'
          ? 'Only paid orders can be fulfilled.'
          : 'That step isn’t available for this order.',
      );
    }
    this.handle.db
      .update(orders)
      .set({
        fulfilmentStatus: status,
        ...(status === 'DELIVERED' ? { status: 'COMPLETED' as const } : {}),
      })
      .where(and(eq(orders.id, o.id), eq(orders.fulfilmentStatus, o.fulfilmentStatus)))
      .run();
    this.audit.record({
      actor: 'OWNER',
      actorId,
      action: 'order.fulfilment',
      entity: 'order',
      entityId: o.id,
      before: { status: o.fulfilmentStatus },
      after: { status },
    });
    return this.get(ref);
  }

  cancel(ref: string, input: CancelOrderInput, actorId: string) {
    const a = cancelOrderSchema.parse(input);
    const o = this.find(ref);
    if (o.status !== 'PENDING_PAYMENT' && o.status !== 'CONFIRMED') {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'INVALID_TRANSITION',
        'This order can’t be cancelled.',
      );
    }
    const paid = o.paymentStatus === 'PAID';
    if (paid && !a.reason) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_FAILED',
        'Please check the highlighted fields.',
        { reason: 'Say why a paid order is cancelled' },
      );
    }
    const { db } = this.handle;
    db.transaction(
      (tx) => {
        const changed = tx
          .update(orders)
          .set({
            status: 'CANCELLED',
            ...(paid && a.refunded ? { paymentStatus: 'REFUNDED' as const } : {}),
            needsAttention: false,
          })
          .where(and(eq(orders.id, o.id), eq(orders.status, o.status)))
          .run().changes;
        if (!changed)
          throw new ApiError(
            HttpStatus.CONFLICT,
            'CONFLICT',
            'The order changed meanwhile. Reload and try again.',
          );
        if (!paid) {
          releaseOrder(tx, o.id);
        } else if (a.restock) {
          // Sold stock comes back as a return, per line.
          for (const item of tx
            .select()
            .from(orderItems)
            .where(eq(orderItems.orderId, o.id))
            .all()) {
            adjustStock(tx, {
              variantId: item.variantId,
              delta: item.quantity,
              reason: 'RETURN',
              note: `Order ${o.ref} cancelled`,
              userId: actorId,
            });
          }
        }
        tx.update(payments)
          .set({ status: 'EXPIRED' })
          .where(and(eq(payments.orderId, o.id), eq(payments.status, 'LINK_CREATED')))
          .run();
      },
      { behavior: 'immediate' },
    );
    this.audit.record({
      actor: 'OWNER',
      actorId,
      action: 'order.cancelled',
      entity: 'order',
      entityId: o.id,
      after: { reason: a.reason, restock: paid ? a.restock : true, refunded: a.refunded },
    });
    this.events.emit('stock.changed', { variantIds: [] });
    return this.get(ref);
  }

  resolveAttention(ref: string, actorId: string) {
    const o = this.find(ref);
    this.handle.db.update(orders).set({ needsAttention: false }).where(eq(orders.id, o.id)).run();
    this.audit.record({
      actor: 'OWNER',
      actorId,
      action: 'order.attention_resolved',
      entity: 'order',
      entityId: o.id,
    });
    return this.get(ref);
  }

  async createPaymentLink(ref: string, actorId: string) {
    const o = this.find(ref);
    await this.payments.createLinkForOrder(o.id, { type: 'OWNER', id: actorId });
    return this.get(ref);
  }

  async checkPayment(ref: string) {
    const o = this.find(ref);
    const result = await this.payments.checkStatus(o.id);
    return { result, order: this.get(ref) };
  }

  listPayments(page = 1, pageSize = 30): Paginated<PaymentDto> {
    const { db, sqlite } = this.handle;
    const total = (sqlite.prepare('select count(*) as n from payments').get() as { n: number }).n;
    const rows = db
      .select({ p: payments, ref: orders.ref })
      .from(payments)
      .innerJoin(orders, eq(orders.id, payments.orderId))
      .orderBy(desc(payments.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .all();
    return { total, page, pageSize, items: rows.map(({ p, ref }) => this.paymentDto(p, ref)) };
  }

  listWebhookEvents(page = 1, pageSize = 30): Paginated<WebhookEventDto> {
    const { db, sqlite } = this.handle;
    const total = (
      sqlite.prepare('select count(*) as n from webhook_events').get() as { n: number }
    ).n;
    const rows = db
      .select()
      .from(webhookEvents)
      .orderBy(desc(webhookEvents.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .all();
    return { total, page, pageSize, items: rows.map((w) => this.webhookDto(w)) };
  }

  customers(query: z.input<typeof customerListQuerySchema>): Paginated<CustomerListItem> {
    const q = customerListQuerySchema.parse(query);
    const params: Record<string, unknown> = {};
    let where = '';
    if (q.q) {
      where = 'where c.full_name like @like or c.phone_e164 like @phoneLike';
      params.like = `%${q.q}%`;
      params.phoneLike = `%${q.q.replace(/\D/g, '').replace(/^0/, '') || q.q}%`;
    }
    const { sqlite } = this.handle;
    const total = (
      sqlite.prepare(`select count(*) as n from customers c ${where}`).get(params) as { n: number }
    ).n;
    const rows = sqlite
      .prepare(
        `select c.id, c.full_name, c.phone_e164, c.created_at,
                count(o.id) as order_count,
                coalesce(sum(case when o.payment_status = 'PAID' then o.total_minor else 0 end), 0) as paid_total,
                max(o.currency) as currency, max(o.created_at) as last_order_at
         from customers c left join orders o on o.customer_id = c.id and o.status != 'DRAFT'
         ${where} group by c.id order by coalesce(max(o.created_at), c.created_at) desc
         limit @limit offset @offset`,
      )
      .all({ ...params, limit: q.pageSize, offset: (q.page - 1) * q.pageSize }) as Array<
      Record<string, unknown>
    >;
    const currency = (
      sqlite.prepare('select currency from business_settings').get() as { currency: string }
    ).currency;
    return {
      total,
      page: q.page,
      pageSize: q.pageSize,
      items: rows.map((r) => ({
        id: r.id as string,
        name: r.full_name as string,
        phone: formatPhone(r.phone_e164 as string),
        orderCount: r.order_count as number,
        paidTotalMinor: r.paid_total as number,
        currency: (r.currency as string | null) ?? currency,
        lastOrderAt: r.last_order_at ? new Date(r.last_order_at as number).toISOString() : null,
        createdAt: new Date(r.created_at as number).toISOString(),
      })),
    };
  }

  /** Dashboard numbers. Only verified payments count as sales (spec §3.7). */
  stats(): DashboardStats {
    const { sqlite } = this.handle;
    const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const s = sqlite
      .prepare(
        `select coalesce(sum(case when payment_status in ('PAID') then total_minor else 0 end), 0) as paid,
                coalesce(sum(case when payment_status = 'PAID' then 1 else 0 end), 0) as paid_count,
                count(*) as orders
         from orders where created_at >= ? and status != 'DRAFT'`,
      )
      .get(since) as { paid: number; paid_count: number; orders: number };
    const attention = sqlite
      .prepare(
        `select ref, created_at,
                case when payment_status = 'PAID' and status = 'CANCELLED' then 'Paid after it was cancelled – refund the customer'
                     when payment_status = 'PAID' then 'Paid, but needs a check (stock or amount)'
                     when status = 'PENDING_PAYMENT' then 'Payment link couldn’t be created'
                     else 'Needs a decision' end as reason
         from orders where needs_attention = 1 order by created_at desc limit 8`,
      )
      .all() as Array<{ ref: string; created_at: number; reason: string }>;
    const currency = (
      sqlite.prepare('select currency from business_settings').get() as { currency: string }
    ).currency;
    return {
      currency,
      paidSales30dMinor: s.paid,
      paidOrders30d: s.paid_count,
      orders30d: s.orders,
      averageOrderMinor: s.paid_count ? Math.round(s.paid / s.paid_count) : null,
      attention: attention.map((a) => ({
        ref: a.ref,
        reason: a.reason,
        createdAt: new Date(a.created_at).toISOString(),
      })),
    };
  }

  private find(ref: string): OrderRow {
    const o = this.handle.db.select().from(orders).where(eq(orders.ref, ref)).get();
    if (!o) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Order not found.');
    return o;
  }

  private toListItem(
    o: OrderRow,
    c: typeof customers.$inferSelect,
    itemCount: number,
  ): OrderListItem {
    return {
      id: o.id,
      ref: o.ref,
      channel: o.channel,
      customer: { id: c.id, name: c.fullName, phone: formatPhone(c.phoneE164) },
      itemCount,
      totalMinor: o.totalMinor,
      currency: o.currency,
      status: o.status,
      paymentStatus: o.paymentStatus,
      fulfilmentStatus: o.fulfilmentStatus,
      fulfilmentMethod: o.fulfilmentMethod,
      needsAttention: o.needsAttention,
      createdAt: o.createdAt.toISOString(),
    };
  }

  private paymentDto(p: typeof payments.$inferSelect, orderRef: string): PaymentDto {
    return {
      id: p.id,
      orderRef,
      provider: p.provider,
      providerLinkId: p.providerLinkId,
      providerPaymentId: p.providerPaymentId,
      paymentUrl: p.paymentUrl,
      amountMinor: p.amountMinor,
      currency: p.currency,
      status: p.status,
      error: p.lastError,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }

  private webhookEventsFor(orderId: string, ref: string) {
    return this.handle.db
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.orderId, orderId))
      .orderBy(desc(webhookEvents.createdAt))
      .all()
      .map((w) => ({ ...this.webhookDto(w), orderRef: ref }));
  }

  private webhookDto(w: typeof webhookEvents.$inferSelect): WebhookEventDto {
    return {
      id: w.id,
      providerEventId: w.providerEventId,
      type: w.type,
      signatureValid: w.signatureValid,
      status: w.status,
      outcome: w.outcome,
      orderRef: null,
      createdAt: w.createdAt.toISOString(),
    };
  }
}
