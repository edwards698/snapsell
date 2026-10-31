import {
  inventory,
  messages,
  orders,
  payments,
  productVariants,
  quotes,
  type DatabaseHandle,
} from '@snapsell/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isExplicitAffirmative, looksLikePaymentClaim } from '../src/ai/affirmative.js';
import { quoteHash, renderQuoteSummary } from '../src/ai/quote-summary.js';
import { executeTool } from '../src/ai/tools.js';
import { DATABASE } from '../src/database/database.module.js';
import { MessagingService } from '../src/messaging/messaging.service.js';
import { WhatsAppOrdersService } from '../src/orders/whatsapp-orders.service.js';
import { signIn, startTestApp, type TestApp } from './helpers.js';

describe('affirmative and payment-claim checks', () => {
  it('accepts clear yes and refuses changes or questions', () => {
    expect(isExplicitAffirmative('yes')).toBe(true);
    expect(isExplicitAffirmative('Yes please')).toBe(true);
    expect(isExplicitAffirmative('ok')).toBe(true);
    expect(isExplicitAffirmative('yes but make it 3')).toBe(false);
    expect(isExplicitAffirmative('yes?')).toBe(false);
    expect(isExplicitAffirmative('maybe')).toBe(false);
    expect(isExplicitAffirmative('')).toBe(false);
  });

  it('detects payment claims without treating them as paid', () => {
    expect(looksLikePaymentClaim("I've paid already")).toBe(true);
    expect(looksLikePaymentClaim('here is my receipt')).toBe(true);
    expect(looksLikePaymentClaim('how much is delivery?')).toBe(false);
  });
});

describe('WhatsApp order guards', () => {
  let t: TestApp;
  let agent: Awaited<ReturnType<typeof signIn>>['agent'];
  let csrf: string;
  let variantId: string;
  let conversationId: string;
  let customerId: string;

  beforeAll(async () => {
    t = await startTestApp();
    ({ agent, csrf } = await signIn(t));
    const product = (
      await agent
        .post('/api/admin/products')
        .set('x-csrf-token', csrf)
        .send({
          name: 'Wireless Headphones',
          variants: [{ priceMinor: 35000, initialStock: 5 }],
        })
        .expect(201)
    ).body as { variants: Array<{ id: string }> };
    variantId = product.variants[0]!.id;

    t.app.get(MessagingService).receive({
      providerMessageId: 'p7-open',
      chatId: '260971111111@c.us',
      phone: '260971111111',
      pushName: 'Edward',
      type: 'TEXT',
      body: 'I want headphones',
      timestamp: Date.now(),
    });
    const row = db()
      .sqlite.prepare(
        `select c.id as conversation_id, c.customer_id
         from conversations c
         order by c.created_at desc limit 1`,
      )
      .get() as { conversation_id: string; customer_id: string };
    conversationId = row.conversation_id;
    customerId = row.customer_id;

    const current = (await agent.get('/api/admin/ai-settings').expect(200)).body as Record<
      string,
      unknown
    >;
    const { configured: _configured, ...rest } = current;
    await agent
      .patch('/api/admin/ai-settings')
      .set('x-csrf-token', csrf)
      .send({
        ...rest,
        enabled: true,
        mode: 'AUTO',
        features: {
          productEnquiries: true,
          stockEnquiries: true,
          showExactStock: false,
          voiceNotes: true,
          imageUnderstanding: true,
          orderAssistance: true,
          draftOrders: true,
          paymentAutoSend: true,
        },
      })
      .expect(200);
  });
  afterAll(async () => {
    await t.close();
  });

  function db(): DatabaseHandle {
    return t.app.get(DATABASE);
  }

  function ordersSvc() {
    return t.app.get(WhatsAppOrdersService);
  }

  function toolCtx(overrides: Partial<Parameters<typeof executeTool>[2]> = {}) {
    const svc = ordersSvc();
    return {
      sqlite: db().sqlite,
      customerId,
      conversationId,
      currency: 'ZMW',
      productEnquiries: true,
      stockEnquiries: true,
      showExactStock: false,
      orderAssistance: true,
      draftOrders: true,
      lastCustomerMessage: 'yes',
      orders: {
        createDraft: (input: Parameters<WhatsAppOrdersService['createOrUpdateDraft']>[2]) =>
          svc.createOrUpdateDraft(conversationId, customerId, input, { create: true }),
        updateDraft: (input: Parameters<WhatsAppOrdersService['createOrUpdateDraft']>[2]) =>
          svc.createOrUpdateDraft(conversationId, customerId, input, { create: false }),
        calculate: (draftId: string) => svc.calculate(conversationId, draftId),
        confirm: (quoteId: string) =>
          svc.confirm(conversationId, quoteId, overrides.lastCustomerMessage ?? 'yes'),
        generatePaymentLink: (orderRef: string) =>
          svc.generatePaymentLink(conversationId, orderRef, { autoSend: true }),
      },
      ...overrides,
    };
  }

  it('refuses price fields on draft tools and refuses payment links on drafts', async () => {
    const withPrice = executeTool(
      'create_draft_order',
      {
        items: [{ variant_id: variantId, quantity: 2, price: 1 }],
      },
      toolCtx(),
    );
    expect(withPrice).toMatchObject({ error: expect.stringMatching(/invalid|Unrecognized|expected/i) });

    const draft = ordersSvc().createOrUpdateDraft(
      conversationId,
      customerId,
      { items: [{ variantId, quantity: 2 }], fulfilmentMethod: 'COLLECTION' },
      { create: true },
    ) as { draft_id: string; order_ref: string };
    expect(draft.draft_id).toBeTruthy();

    const link = await ordersSvc().generatePaymentLink(conversationId, draft.order_ref, {
      autoSend: true,
    });
    expect(link).toMatchObject({ error: expect.stringMatching(/confirmed/i) });
  });

  it('requires a presented summary and a clear yes before confirm; rejects yes-before-quote', async () => {
    const draft = ordersSvc().createOrUpdateDraft(
      conversationId,
      customerId,
      {
        items: [{ variantId, quantity: 1 }],
        fulfilmentMethod: 'COLLECTION',
        customerName: 'Edward Phiri',
      },
      { create: true },
    ) as { draft_id: string };

    const early = ordersSvc().confirm(conversationId, 'no-such-quote', 'yes');
    expect(early).toMatchObject({ error: expect.any(String) });

    const calc = ordersSvc().calculate(conversationId, draft.draft_id) as {
      quote_id: string;
      summary: string;
    };
    expect(calc.summary).toContain('Order summary');
    expect(calc.summary).toContain('K350');

    const beforePresent = ordersSvc().confirm(conversationId, calc.quote_id, 'yes');
    expect(beforePresent).toMatchObject({
      error: expect.stringMatching(/not been sent|summary/i),
    });

    const msgId = 'presented-msg-1';
    db().db.insert(messages).values({
      id: msgId,
      conversationId,
      direction: 'OUT',
      author: 'AI',
      type: 'TEXT',
      body: calc.summary + '\nWould you like to proceed?',
      aiDraftStatus: 'APPROVED',
    }).run();
    ordersSvc().markPresented(conversationId, msgId, calc.summary + '\nWould you like to proceed?');

    const ambiguous = ordersSvc().confirm(conversationId, calc.quote_id, 'yes but make it 3');
    expect(ambiguous).toMatchObject({ needClarification: true });

    const ok = ordersSvc().confirm(conversationId, calc.quote_id, 'yes');
    expect(ok).toMatchObject({ ok: true, status: 'PENDING_PAYMENT' });

    const again = ordersSvc().confirm(conversationId, calc.quote_id, 'yes');
    expect(again).toMatchObject({ alreadyConfirmed: true });

    const order = db().db.select().from(orders).where(eq(orders.quoteId, calc.quote_id)).get()!;
    expect(order.paymentStatus).toBe('UNPAID');
    const reserved = db().db.select().from(inventory).where(eq(inventory.variantId, variantId)).get()!;
    expect(reserved.reserved).toBeGreaterThanOrEqual(1);
  });

  it('re-quotes when price or stock changes between summary and yes', async () => {
    t.app.get(MessagingService).receive({
      providerMessageId: 'p7-stock',
      chatId: '260972222222@c.us',
      phone: '260972222222',
      pushName: 'Chanda',
      type: 'TEXT',
      body: 'hi',
      timestamp: Date.now(),
    });
    const chat = db()
      .sqlite.prepare(
        `select id, customer_id from conversations where channel_address = ?`,
      )
      .get('260972222222@c.us') as { id: string; customer_id: string };

    const product = (
      await agent
        .post('/api/admin/products')
        .set('x-csrf-token', csrf)
        .send({ name: 'Blue Chitenge', variants: [{ priceMinor: 6000, initialStock: 2 }] })
        .expect(201)
    ).body as { variants: Array<{ id: string }> };
    const vId = product.variants[0]!.id;

    const draft = ordersSvc().createOrUpdateDraft(
      chat.id,
      chat.customer_id,
      { items: [{ variantId: vId, quantity: 2 }], fulfilmentMethod: 'COLLECTION' },
      { create: true },
    ) as { draft_id: string };
    const calc = ordersSvc().calculate(chat.id, draft.draft_id) as {
      quote_id: string;
      summary: string;
    };
    const mid = 'presented-stock';
    db().db.insert(messages).values({
      id: mid,
      conversationId: chat.id,
      direction: 'OUT',
      author: 'AI',
      type: 'TEXT',
      body: calc.summary,
      aiDraftStatus: 'APPROVED',
    }).run();
    ordersSvc().markPresented(chat.id, mid, calc.summary);

    db().db
      .update(productVariants)
      .set({ priceMinor: 7500 })
      .where(eq(productVariants.id, vId))
      .run();

    const result = ordersSvc().confirm(chat.id, calc.quote_id, 'yes') as {
      changed?: boolean;
      summary?: string;
      quote_id?: string;
    };
    expect(result.changed).toBe(true);
    expect(result.summary).toBeTruthy();
    expect(result.summary).toContain('K150');
    expect(result.quote_id).toBeTruthy();
    expect(result.quote_id).not.toBe(calc.quote_id);
    const oldQuote = db().db.select().from(quotes).where(eq(quotes.id, calc.quote_id)).get()!;
    expect(oldQuote.consumedAt).toBeNull();
  });

  it('never marks paid via tools and never leaks another customer order', async () => {
    const paidAttempt = executeTool(
      'confirm_order',
      { quote_id: 'x', payment_status: 'PAID', total: 0 },
      toolCtx(),
    );
    expect(paidAttempt).toMatchObject({ error: expect.stringMatching(/unrecognized|invalid/i) });

    const other = executeTool(
      'get_order_status',
      { order_ref: 'ORD-99999' },
      toolCtx({ customerId }),
    );
    expect(other).toMatchObject({ error: expect.stringMatching(/this customer/i) });

    const before = db().db.select().from(payments).all().length;
    await ordersSvc().generatePaymentLink(conversationId, 'ORD-DOES-NOT-EXIST', {
      autoSend: true,
    });
    expect(db().db.select().from(payments).all().length).toBe(before);

    const unpaid = db()
      .db.select()
      .from(orders)
      .where(eq(orders.conversationId, conversationId))
      .get();
    if (unpaid) {
      expect(unpaid.paymentStatus).not.toBe('PAID');
      const status = executeTool(
        'get_order_status',
        { order_ref: unpaid.ref },
        toolCtx({ customerId }),
      ) as { payment_status?: string };
      expect(status.payment_status).toBe('UNPAID');
    }
  });

  it('renders a WhatsApp summary whose hash matches the snapshot', () => {
    const snapshot = {
      items: [
        {
          variantId,
          name: 'Wireless Headphones',
          quantity: 2,
          unitPriceMinor: 35000,
          lineTotalMinor: 70000,
        },
      ],
      fees: { delivery: 5000 },
      totalMinor: 75000,
      currency: 'ZMW',
      fulfilment: 'DELIVERY' as const,
    };
    const summary = renderQuoteSummary(snapshot, 'Test Shop');
    expect(summary).toContain('*Total — K750*');
    expect(summary).not.toContain('|');
    expect(quoteHash(snapshot)).toHaveLength(64);
    expect(quoteHash(snapshot)).toBe(quoteHash({ ...snapshot }));
    expect(quoteHash({ ...snapshot, totalMinor: 1 })).not.toBe(quoteHash(snapshot));
  });

  it('creates a payment link only after confirm and returns a template URL', async () => {
    const order = db()
      .db.select()
      .from(orders)
      .where(eq(orders.conversationId, conversationId))
      .get();
    expect(order?.status).toBe('PENDING_PAYMENT');
    const link = (await ordersSvc().generatePaymentLink(conversationId, order!.ref, {
      autoSend: true,
    })) as { payment_url?: string; payment_message?: string };
    expect(link.payment_url).toMatch(/^https?:\/\//);
    expect(link.payment_message).toContain(link.payment_url!);
    expect(link.payment_message).toContain(order!.ref);
  });
});
