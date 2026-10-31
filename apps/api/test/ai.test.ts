import { messages, type DatabaseHandle } from '@snapsell/db';
import type { AiSettingsDto } from '@snapsell/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AiProvider,
  AiClient,
  type GenerateWithToolsInput,
  type GenerateWithToolsResult,
} from '../src/ai/ai.provider.js';
import { hasUngroundedPrice } from '../src/ai/grounding.js';
import { isWithinHours } from '../src/ai/hours.js';
import { decideSend } from '../src/ai/sending-gate.js';
import { executeTool } from '../src/ai/tools.js';
import { ConversationControlService } from '../src/messaging/conversation-control.service.js';
import { MessagingService } from '../src/messaging/messaging.service.js';
import { DATABASE } from '../src/database/database.module.js';
import { createOrder } from './fixtures/catalog.js';
import { signIn, startTestApp, type TestApp } from './helpers.js';

const baseGate = {
  enabled: true,
  globalMode: 'AUTO' as const,
  conversationMode: 'AI_AUTO' as const,
  generationAtStart: 1,
  generationNow: 1,
  withinHours: true,
  hasAfterHoursMessage: false,
  confidence: 90,
  confidenceThreshold: 70,
  duplicate: false,
  handover: false,
};

describe('sending gate', () => {
  it('drops when the assistant is off, manual, human or paused', () => {
    expect(decideSend({ ...baseGate, enabled: false }).outcome).toBe('DROPPED');
    expect(decideSend({ ...baseGate, globalMode: 'MANUAL' }).outcome).toBe('DROPPED');
    expect(decideSend({ ...baseGate, conversationMode: 'HUMAN' }).outcome).toBe('DROPPED');
    expect(decideSend({ ...baseGate, conversationMode: 'PAUSED' }).outcome).toBe('DROPPED');
  });

  it('caps every conversation at a draft while the global mode is suggest', () => {
    expect(
      decideSend({ ...baseGate, globalMode: 'SUGGEST', conversationMode: 'AI_AUTO' }).action,
    ).toBe('draft');
  });

  it('sends only in auto when confidence is high and nothing changed', () => {
    expect(decideSend(baseGate)).toEqual({ action: 'send', reason: null, outcome: 'AUTO_SENT' });
    expect(decideSend({ ...baseGate, conversationMode: 'AI_SUGGEST' }).action).toBe('draft');
    expect(decideSend({ ...baseGate, confidence: 10 }).action).toBe('draft');
  });

  it('drops a takeover that happens mid-reply, and keeps a handover as a draft', () => {
    expect(decideSend({ ...baseGate, generationNow: 2 }).outcome).toBe('DROPPED');
    expect(decideSend({ ...baseGate, duplicate: true }).reason).toBe('Same as the last message');
    expect(decideSend({ ...baseGate, handover: true, generationNow: 4 }).outcome).toBe('ESCALATED');
    expect(
      decideSend({ ...baseGate, withinHours: false, hasAfterHoursMessage: false }).outcome,
    ).toBe('DROPPED');
    expect(
      decideSend({ ...baseGate, withinHours: false, hasAfterHoursMessage: true }).action,
    ).toBe('send');
  });

  it('treats a shop with no hours as open, and a closed day as shut', () => {
    const hours = {
      days: [
        { day: 1, open: '09:00', close: '17:00' },
        { day: 0, closed: true as const },
      ],
    };
    expect(isWithinHours(null, new Date(), 'UTC')).toBe(true);
    expect(isWithinHours(hours, new Date('2026-10-26T10:00:00Z'), 'UTC')).toBe(true);
    expect(isWithinHours(hours, new Date('2026-10-26T18:00:00Z'), 'UTC')).toBe(false);
    expect(isWithinHours(hours, new Date('2026-10-25T12:00:00Z'), 'UTC')).toBe(false);
  });

  it('flags a Kwacha amount that no tool result contains', () => {
    expect(hasUngroundedPrice("They're K350 each.", '{"price":"K350"}')).toBe(false);
    expect(hasUngroundedPrice("They're K350.00 each.", '{"price":"K350"}')).toBe(false);
    expect(hasUngroundedPrice('It is K999.', '{"price":"K350"}')).toBe(true);
  });
});

class ScriptedAi implements AiProvider {
  configured = true;
  model = 'scripted';
  calls = 0;
  onCall: (() => void) | null = null;
  reply = 'Hello from the assistant.';
  confidence = 95;
  presetKey = '';
  search = false;
  invented = false;

  generateJson() {
    return Promise.resolve({ summary: 'Earlier messages.' });
  }

  async generateWithTools(input: GenerateWithToolsInput): Promise<GenerateWithToolsResult> {
    this.calls += 1;
    this.onCall?.();
    const toolCalls: GenerateWithToolsResult['toolCalls'] = [];
    if (this.search) {
      const result = await input.execute('search_products', { query: 'headphones' });
      toolCalls.push({ name: 'search_products', args: { query: 'headphones' }, result });
      const price =
        (result as { products?: Array<{ price?: string }> }).products?.[0]?.price ?? 'K0';
      this.reply = `Yes, they're ${price} each.`;
    }
    return {
      text: null,
      finish: {
        reply: this.invented ? 'It is K999.' : this.reply,
        interpretation: 'customer asked',
        confidence: this.confidence,
        presetKey: this.presetKey,
      },
      toolCalls,
      latencyMs: 1,
      tokens: 8,
    };
  }
}

describe('assistant turns', () => {
  let t: TestApp;
  let agent: Awaited<ReturnType<typeof signIn>>['agent'];
  let csrf: string;
  let scripted: ScriptedAi;
  let phone = 0;

  beforeAll(async () => {
    t = await startTestApp();
    ({ agent, csrf } = await signIn(t));
    scripted = new ScriptedAi();
    t.app.get(AiClient).use(scripted);
  });
  afterAll(async () => {
    await t.close();
  });

  function db(): DatabaseHandle {
    return t.app.get(DATABASE);
  }

  function inbound(body: string) {
    phone += 1;
    const n = String(phone).padStart(7, '0');
    return t.app.get(MessagingService).receive({
      providerMessageId: `ai-${phone}-${body.slice(0, 12)}`,
      chatId: `26097${n}@c.us`,
      phone: `26097${n}`,
      pushName: 'Mwila',
      type: 'TEXT',
      body,
      timestamp: Date.now(),
    });
  }

  async function configure(mode: 'SUGGEST' | 'AUTO' | 'MANUAL', enabled = true) {
    const current = (await agent.get('/api/admin/ai-settings').expect(200)).body as AiSettingsDto;
    const { configured: _configured, ...rest } = current;
    await agent
      .patch('/api/admin/ai-settings')
      .set('x-csrf-token', csrf)
      .send({ ...rest, enabled, mode })
      .expect(200);
  }

  async function drain() {
    db().sqlite.prepare(`update jobs set run_at = 0 where queue = 'ai.respond'`).run();
    await t.worker.drain();
  }

  function outboundQueued() {
    return (
      db().sqlite.prepare(
        `select count(*) as n from jobs where queue = 'wa.outbound' and status = 'QUEUED'`,
      ).get() as { n: number }
    ).n;
  }

  it('drafts in suggest mode, sends in auto, and drops when the assistant is off', async () => {
    await configure('SUGGEST');
    scripted.calls = 0;
    inbound('Do you have headphones?');
    await drain();
    expect(scripted.calls).toBe(1);
    const draft = db().db.select().from(messages).all().find((m) => m.author === 'AI');
    expect(draft?.aiDraftStatus).toBe('DRAFT');
    expect(outboundQueued()).toBe(0);

    const approved = await agent
      .post(`/api/admin/conversations/${draft!.conversationId}/drafts/${draft!.id}/approve`)
      .set('x-csrf-token', csrf)
      .expect(200);
    expect(approved.body.aiDraftStatus).toBe('APPROVED');
    expect(outboundQueued()).toBe(1);

    await configure('MANUAL', false);
    const before = scripted.calls;
    inbound('Another question');
    await drain();
    expect(scripted.calls).toBe(before);
    const dropped = db()
      .sqlite.prepare(`select outcome from ai_activity_logs order by created_at desc limit 1`)
      .get() as { outcome: string };
    expect(dropped.outcome).toBe('DROPPED');
  });

  it('treats a burst as one turn', async () => {
    await configure('SUGGEST');
    scripted.calls = 0;
    const n = String(++phone).padStart(7, '0');
    const chat = `26096${n}@c.us`;
    const messaging = t.app.get(MessagingService);
    messaging.receive({
      providerMessageId: `burst-a-${phone}`,
      chatId: chat,
      phone: `26096${n}`,
      pushName: 'Mwila',
      type: 'TEXT',
      body: 'Hello',
      timestamp: Date.now(),
    });
    messaging.receive({
      providerMessageId: `burst-b-${phone}`,
      chatId: chat,
      phone: `26096${n}`,
      pushName: 'Mwila',
      type: 'TEXT',
      body: 'Are you open?',
      timestamp: Date.now(),
    });
    const queued = db().sqlite
      .prepare(`select count(*) as n from jobs where queue = 'ai.respond' and status = 'QUEUED'`)
      .get() as { n: number };
    expect(queued.n).toBe(1);
    await drain();
    expect(scripted.calls).toBe(1);
  });

  it('drops when the chat is paused, and when the owner takes over mid-reply', async () => {
    await configure('AUTO');
    scripted.onCall = null;
    scripted.reply = 'Paused reply';
    const n = String(++phone).padStart(7, '0');
    const chat = `26095${n}@c.us`;
    const messaging = t.app.get(MessagingService);
    const send = (id: string, body: string) =>
      messaging.receive({
        providerMessageId: id,
        chatId: chat,
        phone: `26095${n}`,
        pushName: 'Mwila',
        type: 'TEXT',
        body,
        timestamp: Date.now(),
      });
    send(`pause-a-${n}`, 'Hi');
    const pausedId = (
      db().sqlite.prepare(`select id from conversations order by created_at desc limit 1`).get() as {
        id: string;
      }
    ).id;
    t.app.get(ConversationControlService).setMode(pausedId, 'PAUSED', { type: 'SYSTEM' });
    send(`pause-b-${n}`, 'Hello again');
    await drain();
    const paused = db()
      .sqlite.prepare(`select outcome from ai_activity_logs order by created_at desc limit 1`)
      .get() as { outcome: string };
    expect(paused.outcome).toBe('DROPPED');

    scripted.reply = 'Too late';
    scripted.onCall = () => {
      const row = db()
        .sqlite.prepare(`select id from conversations order by created_at desc limit 1`)
        .get() as { id: string };
      t.app.get(ConversationControlService).setMode(row.id, 'HUMAN', { type: 'SYSTEM' });
    };
    inbound('Mid reply');
    await drain();
    scripted.onCall = null;
    const last = db()
      .sqlite.prepare(`select outcome from ai_activity_logs order by created_at desc limit 1`)
      .get() as { outcome: string };
    expect(last.outcome).toBe('DROPPED');
    expect(
      db()
        .db.select()
        .from(messages)
        .all()
        .some((m) => m.body === 'Too late'),
    ).toBe(false);
  });

  it('quotes a catalogue price, refuses an invented one, and copies a preset verbatim', async () => {
    await agent
      .post('/api/admin/products')
      .set('x-csrf-token', csrf)
      .send({ name: 'Wireless Headphones', variants: [{ priceMinor: 35000, initialStock: 4 }] })
      .expect(201);

    await configure('AUTO');
    scripted.search = true;
    scripted.invented = false;
    scripted.calls = 0;
    inbound('How much are the headphones?');
    await drain();
    const sent = db()
      .db.select()
      .from(messages)
      .all()
      .filter((m) => m.author === 'AI')
      .at(-1);
    expect(sent?.body).toContain('K350');
    expect(sent?.aiDraftStatus).toBe('APPROVED');
    // The WhatsApp service is not running in this suite, so delivery ends as ERROR after retries.
    expect(['PENDING', 'ERROR']).toContain(sent?.deliveryState);

    scripted.search = false;
    scripted.invented = true;
    const before = outboundQueued();
    inbound('Invent a price');
    await drain();
    const invented = db()
      .db.select()
      .from(messages)
      .all()
      .filter((m) => m.body === 'It is K999.')
      .at(-1);
    expect(invented?.aiDraftStatus).toBe('DRAFT');
    expect(outboundQueued()).toBe(before);
    scripted.invented = false;

    await agent
      .put('/api/admin/ai-settings/presets')
      .set('x-csrf-token', csrf)
      .send({
        presets: [
          { key: 'greeting', text: 'Welcome in.', enabled: true },
          { key: 'hours', text: 'WE ARE OPEN NINE TO FIVE', enabled: true },
          { key: 'location', text: 'Woodlands.', enabled: true },
          { key: 'delivery', text: 'We deliver.', enabled: true },
          { key: 'payment', text: 'Pay by link.', enabled: true },
        ],
      })
      .expect(200);
    scripted.presetKey = 'hours';
    scripted.reply = 'We open whenever.';
    inbound('What are your hours?');
    await drain();
    scripted.presetKey = '';
    const hours = db()
      .db.select()
      .from(messages)
      .all()
      .filter((m) => m.author === 'AI')
      .at(-1);
    expect(hours?.body).toBe('WE ARE OPEN NINE TO FIVE');
  });

  it('hides stock counts, refuses another customer’s order, and keeps the sandbox off WhatsApp', async () => {
    const created = (
      await agent
        .post('/api/admin/products')
        .set('x-csrf-token', csrf)
        .send({ name: 'Chitenge', variants: [{ priceMinor: 6000, initialStock: 5 }] })
        .expect(201)
    ).body as { variants: Array<{ id: string }> };
    const variantId = created.variants[0]!.id;
    const toolBase = {
      sqlite: db().sqlite,
      conversationId: null as string | null,
      currency: 'ZMW',
      productEnquiries: true,
      stockEnquiries: true,
      orderAssistance: false,
      draftOrders: false,
      lastCustomerMessage: '',
    };
    const hidden = executeTool('check_stock', { variant_id: variantId, quantity: 1 }, {
      ...toolBase,
      customerId: 'nobody',
      showExactStock: false,
    }) as { available: boolean; availableCount?: number };
    expect(hidden.available).toBe(true);
    expect(hidden.availableCount).toBeUndefined();
    const shown = executeTool('check_stock', { variant_id: variantId, quantity: 1 }, {
      ...toolBase,
      customerId: 'nobody',
      showExactStock: true,
    }) as { availableCount: number };
    expect(shown.availableCount).toBe(5);

    const orderId = createOrder(db().db, [{ variantId, quantity: 1 }]);
    const order = db()
      .sqlite.prepare(`select ref, customer_id from orders where id = ?`)
      .get(orderId) as { ref: string; customer_id: string };
    inbound('Where is my order?');
    const customer = db()
      .sqlite.prepare(
        `select customer_id from conversations order by created_at desc limit 1`,
      )
      .get() as { customer_id: string };
    const refused = executeTool('get_order_status', { order_ref: order.ref }, {
      ...toolBase,
      customerId: customer.customer_id,
      showExactStock: false,
    }) as { error?: string; order_ref?: string };
    expect(refused.error).toMatch(/this customer/i);
    const own = executeTool('get_order_status', { order_ref: order.ref }, {
      ...toolBase,
      customerId: order.customer_id,
      showExactStock: false,
    }) as { order_ref?: string };
    expect(own.order_ref).toBe(order.ref);

    const before = db().db.select().from(messages).all().length;
    scripted.reply = 'Sandbox reply only.';
    scripted.search = false;
    const sandbox = await agent
      .post('/api/admin/ai/sandbox')
      .set('x-csrf-token', csrf)
      .send({ message: 'Do you have a chitenge?' })
      .expect(200);
    expect(sandbox.body.reply).toBe('Sandbox reply only.');
    expect(db().db.select().from(messages).all().length).toBe(before);
  });
});
