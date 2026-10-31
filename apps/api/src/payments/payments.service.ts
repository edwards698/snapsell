import { createHash, randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  type DatabaseHandle,
  integrations,
  newId,
  orders,
  payments,
  users,
  webhookEvents,
} from '@snapsell/db';
import { formatMoney } from '@snapsell/shared';
import { and, desc, eq, inArray, lt, ne, sql } from 'drizzle-orm';
import { type Logger } from 'pino';
import { AuditService } from '../common/audit.service.js';
import { ApiError } from '../common/errors.js';
import { EventBus } from '../common/events.js';
import { commitOrderSale } from '../catalog/inventory-ops.js';
import { APP_CONFIG } from '../config/config.module.js';
import { type AppConfig } from '../config/config.js';
import { DATABASE } from '../database/database.module.js';
import { EmailService } from '../email/email.service.js';
import { JobQueue } from '../jobs/job-queue.js';
import { JobWorker } from '../jobs/job-worker.js';
import { LOGGER } from '../logging/logging.module.js';
import { MessagingService } from '../messaging/messaging.service.js';
import { signBody } from './devdraft.provider.js';
import { FakePaymentProvider } from './fake.provider.js';
import {
  PAYMENT_PROVIDER,
  type PaymentEvent,
  type PaymentProvider,
  PaymentProviderError,
} from './payment.provider.js';

type Actor = { type: 'OWNER'; id: string } | { type: 'SYSTEM' };
type PaymentRow = typeof payments.$inferSelect;

const RECONCILE_AFTER_MS = 5 * 60_000;

@Injectable()
export class PaymentsService implements OnModuleInit {
  constructor(
    @Inject(DATABASE) private readonly handle: DatabaseHandle,
    @Inject(PAYMENT_PROVIDER) readonly provider: PaymentProvider,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(LOGGER) private readonly logger: Logger,
    private readonly queue: JobQueue,
    private readonly worker: JobWorker,
    private readonly email: EmailService,
    private readonly events: EventBus,
    private readonly audit: AuditService,
    private readonly messaging: MessagingService,
  ) {}

  onModuleInit() {
    this.handle.db
      .update(integrations)
      .set({
        status: this.provider.mode === 'fake' ? 'TEST_MODE' : 'CONFIGURED',
        metadata: {
          detail:
            this.provider.mode === 'fake'
              ? 'Simulated payments (DEVDRAFT_MODE=fake)'
              : `DevDraft ${this.provider.mode}`,
        },
      })
      .where(eq(integrations.kind, 'DEVDRAFT'))
      .run();
    // One at a time: payment events for the same order must never be applied concurrently.
    this.worker.register<{ webhookEventId: string }>(
      'payments.webhook',
      ({ webhookEventId }) => {
        this.process(webhookEventId);
      },
      {
        concurrency: 1,
        lockMs: 60_000,
      },
    );
    if (this.provider.fetchLinkStatus) {
      this.worker.register('payments.reconcile', () => this.reconcileStale());
      this.worker.schedule('payments.reconcile', 10 * 60_000, 'payments.reconcile');
    }
  }

  // ---------------------------------------------------------------------------
  // Payment links
  // ---------------------------------------------------------------------------

  /**
   * Returns the order's active payment link, creating one if needed (spec §7.2). Safe to call
   * repeatedly: an existing link is reused, and a crashed attempt is retried with the same
   * idempotency key so DevDraft never creates two links for one attempt.
   */
  async createLinkForOrder(orderId: string, actor: Actor): Promise<PaymentRow> {
    try {
      return await this.createLink(orderId, actor);
    } catch (err) {
      // Automatic attempts (at checkout) have no one watching: flag the order for the owner.
      if (actor.type === 'SYSTEM' && err instanceof ApiError && err.code !== 'ORDER_PAID') {
        this.handle.db
          .update(orders)
          .set({ needsAttention: true })
          .where(eq(orders.id, orderId))
          .run();
        if (err.code !== 'PAYMENT_LINK_FAILED') {
          this.audit.record({
            actor: 'SYSTEM',
            action: 'payment.link_failed',
            entity: 'order',
            entityId: orderId,
            after: { error: err.message },
          });
        }
      }
      throw err;
    }
  }

  private async createLink(orderId: string, actor: Actor): Promise<PaymentRow> {
    const { db } = this.handle;
    const order = db.select().from(orders).where(eq(orders.id, orderId)).get();
    if (!order) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Order not found.');
    if (order.paymentStatus === 'PAID')
      throw new ApiError(HttpStatus.CONFLICT, 'ORDER_PAID', 'This order is already paid.');
    if (order.status !== 'PENDING_PAYMENT') {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'ORDER_NOT_PAYABLE',
        `Orders that are ${order.status.toLowerCase().replace('_', ' ')} can’t be paid.`,
      );
    }
    if (order.reservationExpiresAt && order.reservationExpiresAt.getTime() <= Date.now()) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'RESERVATION_EXPIRED',
        'The stock reservation for this order has expired.',
      );
    }
    if (!this.provider.supportsCurrency(order.currency)) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'CURRENCY_NOT_SUPPORTED',
        `DevDraft doesn’t accept ${order.currency} payments on this account (accepted: ${this.config.devdraft.currencies.join(', ')}). Confirm currency support with DevDraft or change the shop currency.`,
      );
    }

    const active = db
      .select()
      .from(payments)
      .where(and(eq(payments.orderId, orderId), eq(payments.status, 'LINK_CREATED')))
      .orderBy(desc(payments.createdAt))
      .get();
    if (active && active.amountMinor === order.totalMinor) return active;

    const interrupted = db
      .select()
      .from(payments)
      .where(and(eq(payments.orderId, orderId), eq(payments.status, 'CREATING')))
      .get();
    const payment =
      interrupted ??
      db
        .insert(payments)
        .values({
          id: newId(),
          orderId,
          provider: this.provider.name,
          amountMinor: order.totalMinor,
          currency: order.currency,
          status: 'CREATING',
          idempotencyKey: randomUUID(),
        })
        .returning()
        .get();

    try {
      const link = await this.provider.createLink({
        orderRef: order.ref,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        title: `${this.shopName()} order ${order.ref}`,
        description: `Payment for order ${order.ref}: ${formatMoney(order.totalMinor, order.currency)}.`,
        expiresAt: order.reservationExpiresAt,
        idempotencyKey: payment.idempotencyKey,
      });
      db.transaction((tx) => {
        tx.update(payments)
          .set({
            status: 'LINK_CREATED',
            providerLinkId: link.providerLinkId,
            paymentUrl: link.paymentUrl,
            rawResponse: link.raw,
            lastError: null,
          })
          .where(eq(payments.id, payment.id))
          .run();
        tx.update(orders)
          .set({ paymentStatus: 'LINK_CREATED' })
          .where(and(eq(orders.id, orderId), inArray(orders.paymentStatus, ['UNPAID', 'FAILED'])))
          .run();
      });
      this.audit.record({
        actor: actor.type,
        actorId: actor.type === 'OWNER' ? actor.id : null,
        action: 'payment.link_created',
        entity: 'order',
        entityId: orderId,
        after: { providerLinkId: link.providerLinkId, amountMinor: payment.amountMinor },
      });
      return db.select().from(payments).where(eq(payments.id, payment.id)).get()!;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      db.update(payments)
        .set({
          status: 'FAILED',
          lastError: message,
          rawResponse: err instanceof PaymentProviderError ? (err.raw ?? null) : null,
        })
        .where(eq(payments.id, payment.id))
        .run();
      this.audit.record({
        actor: 'SYSTEM',
        action: 'payment.link_failed',
        entity: 'order',
        entityId: orderId,
        after: { error: message },
      });
      this.logger.error({ err, ref: order.ref }, 'Payment link creation failed');
      throw new ApiError(
        HttpStatus.BAD_GATEWAY,
        'PAYMENT_LINK_FAILED',
        `The payment link couldn’t be created: ${message}`,
      );
    }
  }

  /** The URL a customer can pay at right now, if any. */
  activePaymentUrl(orderId: string) {
    const row = this.handle.db
      .select({ url: payments.paymentUrl })
      .from(payments)
      .where(and(eq(payments.orderId, orderId), eq(payments.status, 'LINK_CREATED')))
      .orderBy(desc(payments.createdAt))
      .get();
    return row?.url ?? null;
  }

  // ---------------------------------------------------------------------------
  // Webhooks (spec §7.4)
  // ---------------------------------------------------------------------------

  /**
   * Verifies and records a webhook, then queues it for processing. The event row is written
   * before any processing, and its unique key makes duplicate deliveries harmless.
   */
  receiveWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): 'accepted' | 'duplicate' | 'invalid_signature' {
    const valid = this.provider.verifySignature(rawBody, headers);
    let event: PaymentEvent;
    try {
      event = this.provider.parseEvent(rawBody);
    } catch {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'BAD_REQUEST', 'Invalid JSON.');
    }
    const payload = JSON.parse(rawBody.toString('utf8')) as unknown;
    if (!valid) {
      this.handle.db
        .insert(webhookEvents)
        .values({
          id: newId(),
          provider: this.provider.name,
          providerEventId: `invalid:${createHash('sha256').update(rawBody).digest('hex')}`,
          type: event.rawType || 'unknown',
          signatureValid: false,
          payload,
          status: 'IGNORED',
          outcome: 'Rejected: signature did not verify',
        })
        .onConflictDoNothing()
        .run();
      this.logger.warn({ type: event.rawType }, 'Webhook rejected: invalid signature');
      return 'invalid_signature';
    }
    const inserted = this.handle.db
      .insert(webhookEvents)
      .values({
        id: newId(),
        provider: this.provider.name,
        providerEventId: event.eventId,
        type: event.rawType || 'unknown',
        signatureValid: true,
        payload,
      })
      .onConflictDoNothing()
      .returning({ id: webhookEvents.id })
      .get();
    if (!inserted) return 'duplicate';
    this.queue.enqueue(
      'payments.webhook',
      { webhookEventId: inserted.id },
      { dedupeKey: `webhook:${inserted.id}`, maxAttempts: 8 },
    );
    return 'accepted';
  }

  /** Applies one recorded event. Idempotent: a second run of a processed event does nothing. */
  process(webhookEventId: string) {
    const { db } = this.handle;
    const row = db.select().from(webhookEvents).where(eq(webhookEvents.id, webhookEventId)).get();
    if (!row || row.status !== 'RECEIVED') return;
    db.update(webhookEvents)
      .set({ attempts: row.attempts + 1 })
      .where(eq(webhookEvents.id, row.id))
      .run();
    const event = this.provider.parseEvent(Buffer.from(JSON.stringify(row.payload)));
    const finish = (status: 'PROCESSED' | 'IGNORED', outcome: string) =>
      db.update(webhookEvents).set({ status, outcome }).where(eq(webhookEvents.id, row.id)).run();

    if (event.type === 'other')
      return finish('IGNORED', `Not a payment event (${event.rawType || 'no type'})`);
    const payment = event.providerLinkId
      ? db.select().from(payments).where(eq(payments.providerLinkId, event.providerLinkId)).get()
      : undefined;
    if (!payment) return finish('IGNORED', 'No payment link matches this event');
    const order = db.select().from(orders).where(eq(orders.id, payment.orderId)).get()!;
    db.update(webhookEvents).set({ orderId: order.id }).where(eq(webhookEvents.id, row.id)).run();

    const amountOk = event.amountMinor === null || event.amountMinor === payment.amountMinor;
    const currencyOk = event.currency === null || event.currency === payment.currency.toLowerCase();
    if (!amountOk || !currencyOk) {
      db.update(orders).set({ needsAttention: true }).where(eq(orders.id, order.id)).run();
      this.audit.record({
        actor: 'SYSTEM',
        action: 'payment.mismatch',
        entity: 'order',
        entityId: order.id,
        after: { event: event.amountMinor, currency: event.currency },
      });
      return finish(
        'IGNORED',
        `Amount or currency doesn’t match the order (${event.amountMinor} ${event.currency})`,
      );
    }

    if (event.type === 'payment.failed') {
      db.transaction((tx) => {
        tx.update(payments)
          .set({ status: 'FAILED', lastError: 'Payment failed at DevDraft' })
          .where(and(eq(payments.id, payment.id), ne(payments.status, 'PAID')))
          .run();
        // The reservation stays until it expires, so the customer can try again.
        tx.update(orders)
          .set({ paymentStatus: 'FAILED' })
          .where(and(eq(orders.id, order.id), ne(orders.paymentStatus, 'PAID')))
          .run();
      });
      this.audit.record({
        actor: 'SYSTEM',
        action: 'payment.failed',
        entity: 'order',
        entityId: order.id,
      });
      this.notifyWhatsApp(
        order,
        `We could not confirm payment for order *${order.ref}* yet. Your reservation is still held for a little while — you can try the payment link again, or reply here for help.`,
      );
      return finish('PROCESSED', 'Marked payment failed');
    }

    // payment.completed
    let outcome = '';
    let newlyPaid = false;
    let shortage = false;
    db.transaction(
      (tx) => {
        const changed = tx
          .update(orders)
          .set({
            paymentStatus: 'PAID',
            status: sql`case when ${orders.status} in ('PENDING_PAYMENT', 'EXPIRED') then 'CONFIRMED' else ${orders.status} end`,
            fulfilmentStatus: sql`case when ${orders.fulfilmentStatus} = 'UNFULFILLED' and ${orders.status} != 'CANCELLED' then 'PROCESSING' else ${orders.fulfilmentStatus} end`,
            needsAttention: sql`case when ${orders.status} = 'CANCELLED' then 1 else ${orders.needsAttention} end`,
          })
          .where(and(eq(orders.id, order.id), ne(orders.paymentStatus, 'PAID')))
          .run().changes;
        tx.update(payments)
          .set({
            status: 'PAID',
            providerPaymentId: event.providerPaymentId ?? payment.providerPaymentId,
          })
          .where(eq(payments.id, payment.id))
          .run();
        if (!changed) {
          outcome = 'Order was already paid';
          return;
        }
        newlyPaid = true;
        if (order.status === 'CANCELLED') {
          outcome = 'Paid after the order was cancelled – refund needed';
          return;
        }
        // Converts the reservation into a sale, or takes from available stock for a late payment.
        const sale = commitOrderSale(tx, order.id);
        shortage = !sale.ok;
        if (shortage)
          tx.update(orders).set({ needsAttention: true }).where(eq(orders.id, order.id)).run();
        outcome = shortage ? 'Marked paid – stock ran out, needs your attention' : 'Marked paid';
      },
      { behavior: 'immediate' },
    );
    finish('PROCESSED', outcome);
    if (newlyPaid) {
      this.audit.record({
        actor: 'SYSTEM',
        action: 'payment.completed',
        entity: 'order',
        entityId: order.id,
        after: { amountMinor: payment.amountMinor },
      });
      this.events.emit('stock.changed', { variantIds: [] });
      this.notifyOwner(order.id);
      const total = formatMoney(order.totalMinor, order.currency, { trimZeros: true });
      this.notifyWhatsApp(
        order,
        shortage
          ? `Payment for *${order.ref}* (${total}) is confirmed, but stock needs the owner’s attention. We will message you shortly.`
          : `Payment for *${order.ref}* (${total}) is confirmed. Thank you — we are preparing your order.`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Reconciliation (missed or delayed webhooks)
  // ---------------------------------------------------------------------------

  /** Asks the provider about one order's link; a paid result goes through the normal processor. */
  async checkStatus(orderId: string) {
    if (!this.provider.fetchLinkStatus) {
      throw new ApiError(
        HttpStatus.NOT_IMPLEMENTED,
        'NOT_SUPPORTED',
        'DevDraft doesn’t offer a payment status lookup on this account yet; waiting for its webhook.',
      );
    }
    const payment = this.handle.db
      .select()
      .from(payments)
      .where(and(eq(payments.orderId, orderId), eq(payments.status, 'LINK_CREATED')))
      .orderBy(desc(payments.createdAt))
      .get();
    if (!payment?.providerLinkId) return 'no_link' as const;
    // Demo links live in memory; rebuild from the payments row after a restart (D20).
    if (this.provider instanceof FakePaymentProvider) {
      this.hydrateFakeLink(payment.providerLinkId);
    }
    const status = await this.provider.fetchLinkStatus(payment.providerLinkId);
    if (status === 'paid' || status === 'failed') {
      const body = Buffer.from(
        JSON.stringify({
          id: `reconcile:${payment.providerLinkId}:${status}`,
          type: status === 'paid' ? 'payment.completed' : 'payment.failed',
          data: { paymentLinkId: payment.providerLinkId },
        }),
      );
      const id = this.handle.db
        .insert(webhookEvents)
        .values({
          id: newId(),
          provider: this.provider.name,
          providerEventId: `reconcile:${payment.providerLinkId}:${status}`,
          type: status === 'paid' ? 'payment.completed' : 'payment.failed',
          signatureValid: true,
          payload: JSON.parse(body.toString()) as unknown,
        })
        .onConflictDoNothing()
        .returning({ id: webhookEvents.id })
        .get()?.id;
      if (id) this.process(id);
    }
    return status;
  }

  private async reconcileStale() {
    const stale = this.handle.db
      .select({ orderId: payments.orderId })
      .from(payments)
      .innerJoin(orders, eq(orders.id, payments.orderId))
      .where(
        and(
          eq(payments.status, 'LINK_CREATED'),
          lt(payments.createdAt, new Date(Date.now() - RECONCILE_AFTER_MS)),
          ne(orders.paymentStatus, 'PAID'),
        ),
      )
      .all();
    for (const { orderId } of stale) {
      try {
        await this.checkStatus(orderId);
      } catch (err) {
        this.logger.warn({ err, orderId }, 'Reconciliation check failed');
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Test mode
  // ---------------------------------------------------------------------------

  /** Test mode only: what the /pay/test page shows. Survives API restarts via the payments row. */
  testLink(providerLinkId: string) {
    const payment = this.hydrateFakeLink(providerLinkId);
    const order = this.handle.db.select().from(orders).where(eq(orders.id, payment.orderId)).get()!;
    return {
      orderRef: order.ref,
      statusUrl: `/order/${order.ref}?t=${encodeURIComponent(order.statusToken)}`,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      status: this.fake().links.get(providerLinkId)!.status,
      shopName: this.shopName(),
    };
  }

  /** Test mode only: sends a signed webhook exactly as DevDraft would. */
  simulate(providerLinkId: string, outcome: 'completed' | 'failed') {
    this.hydrateFakeLink(providerLinkId);
    const fake = this.fake();
    const body = fake.eventBody(providerLinkId, outcome);
    if (!body)
      throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Test payment link not found.');
    fake.links.get(providerLinkId)!.status = outcome === 'completed' ? 'paid' : 'failed';
    return this.receiveWebhook(Buffer.from(body), {
      [this.config.devdraft.signatureHeader]: signBody(this.config.devdraft.webhookSecret, body),
    });
  }

  /** Rebuild the in-memory fake link from the DB when the process restarted (D20). */
  private hydrateFakeLink(providerLinkId: string) {
    const fake = this.fake();
    const payment = this.handle.db
      .select()
      .from(payments)
      .where(eq(payments.providerLinkId, providerLinkId))
      .get();
    if (!payment)
      throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Test payment link not found.');
    const status =
      payment.status === 'PAID' ? 'paid' : payment.status === 'FAILED' ? 'failed' : 'pending';
    fake.remember(providerLinkId, payment.amountMinor, payment.currency, status);
    return payment;
  }

  private fake() {
    if (!(this.provider instanceof FakePaymentProvider))
      throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Not found.');
    return this.provider;
  }

  private notifyOwner(orderId: string) {
    const { db } = this.handle;
    const order = db.select().from(orders).where(eq(orders.id, orderId)).get()!;
    const owner = db.select().from(users).where(eq(users.role, 'OWNER')).get();
    if (!owner) return;
    this.email.enqueue(owner.email, 'order-paid', {
      shopName: this.shopName(),
      ref: order.ref,
      total: formatMoney(order.totalMinor, order.currency),
      url: `${this.config.publicWebUrl}/admin/orders/${order.ref}`,
      attention: order.needsAttention,
    });
  }

  private notifyWhatsApp(
    order: typeof orders.$inferSelect,
    body: string,
  ) {
    if (order.channel !== 'WHATSAPP' || !order.conversationId) return;
    try {
      this.messaging.sendTemplate(order.conversationId, body, 'SYSTEM');
    } catch (err) {
      this.logger.warn({ err, orderId: order.id }, 'Could not send WhatsApp payment notice');
    }
  }

  private shopName() {
    return (
      this.handle.sqlite.prepare('select name from business_settings').get() as { name: string }
    ).name;
  }
}
