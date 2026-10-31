import { createHmac } from 'node:crypto';
import { conversationControls, type DatabaseHandle, messages } from '@snapsell/db';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DATABASE } from '../src/database/database.module.js';
import { JobQueue } from '../src/jobs/job-queue.js';
import { ConversationControlService } from '../src/messaging/conversation-control.service.js';
import { MessagingService } from '../src/messaging/messaging.service.js';
import { WaServiceClient, WaServiceError } from '../src/messaging/wa-service.client.js';
import { signIn, startTestApp, type TestApp } from './helpers.js';

let t: TestApp;
let admin: Awaited<ReturnType<typeof signIn>>;
let h: DatabaseHandle;
let messaging: MessagingService;
let control: ConversationControlService;
let queue: JobQueue;
let wa: WaServiceClient;

beforeEach(async () => {
  t = await startTestApp();
  admin = await signIn(t);
  h = t.app.get(DATABASE);
  messaging = t.app.get(MessagingService);
  control = t.app.get(ConversationControlService);
  queue = t.app.get(JobQueue);
  wa = t.app.get(WaServiceClient);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await t.close();
});

const aPost = (path: string, body?: object) =>
  admin.agent
    .post(`/api/admin${path}`)
    .set('x-csrf-token', admin.csrf)
    .send(body ?? {});
const aGet = (path: string) => admin.agent.get(`/api/admin${path}`);

function sign(body: string | Buffer, ts = String(Date.now())) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  return {
    ts,
    sig: createHmac('sha256', t.config.secrets.internalHmac)
      .update(`${ts}.`)
      .update(buf)
      .digest('hex'),
  };
}

function postEvent(payload: unknown, headers: Record<string, string> = {}) {
  const body = JSON.stringify(payload);
  const { ts, sig } = sign(body);
  return t
    .http()
    .post('/api/internal/wa/events')
    .set('content-type', 'application/json')
    .set('x-snapsell-timestamp', headers['x-snapsell-timestamp'] ?? ts)
    .set('x-snapsell-signature', headers['x-snapsell-signature'] ?? sig)
    .set(headers)
    .send(body);
}

function inbound(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'message' as const,
    message: {
      providerMessageId: 'pm-1',
      chatId: '260971234567@c.us',
      phone: '260971234567',
      pushName: 'Mwila',
      type: 'TEXT',
      body: 'Hello',
      timestamp: Date.now(),
      ...overrides,
    },
  };
}

async function openConversation() {
  await postEvent(inbound()).expect(200);
  const id = (await aGet('/conversations').expect(200)).body.items[0].id as string;
  return id;
}

function countJobs(queueName: string, status?: string) {
  const row = (
    status
      ? h.sqlite.prepare(`select count(*) as n from jobs where queue = ? and status = ?`).get(queueName, status)
      : h.sqlite.prepare(`select count(*) as n from jobs where queue = ?`).get(queueName)
  ) as { n: number };
  return row.n;
}

describe('inbound', () => {
  it('stores a message once and enqueues one ai.respond job', async () => {
    await postEvent(inbound()).expect(200);
    await postEvent(inbound()).expect(200);

    expect(h.db.select().from(messages).all()).toHaveLength(1);
    expect(countJobs('ai.respond')).toBe(1);
  });

  it('rejects a bad HMAC signature', async () => {
    const body = JSON.stringify(inbound());
    const { ts } = sign(body);
    await t
      .http()
      .post('/api/internal/wa/events')
      .set('content-type', 'application/json')
      .set('x-snapsell-timestamp', ts)
      .set('x-snapsell-signature', '00'.repeat(32))
      .send(body)
      .expect(401);
  });

  it('rejects a stale timestamp', async () => {
    const body = JSON.stringify(inbound());
    const { ts, sig } = sign(body, String(Date.now() - 10 * 60_000));
    await t
      .http()
      .post('/api/internal/wa/events')
      .set('content-type', 'application/json')
      .set('x-snapsell-timestamp', ts)
      .set('x-snapsell-signature', sig)
      .send(body)
      .expect(401);
  });

  it('rejects a non-local peer (X-Forwarded-For)', async () => {
    await postEvent(inbound(), { 'X-Forwarded-For': '8.8.8.8' }).expect(403);
  });
});

describe('takeover', () => {
  it('bumps generation, cancels ai.respond, and only auto-releases timed takeovers', async () => {
    const conversationId = await openConversation();
    const before = control.get(conversationId);
    expect(countJobs('ai.respond', 'QUEUED')).toBe(1);

    const until = new Date(Date.now() + 60_000).toISOString();
    await aPost(`/conversations/${conversationId}/takeover`, { until }).expect(200);
    const taken = control.get(conversationId);
    expect(taken.mode).toBe('HUMAN');
    expect(taken.generation).toBe(before.generation + 1);
    expect(taken.takeoverUntil).toBeTruthy();
    expect(countJobs('ai.respond', 'QUEUED')).toBe(0);
    expect(countJobs('ai.respond', 'CANCELLED')).toBe(1);

    // Timed takeover that has already expired is handed back.
    h.db
      .update(conversationControls)
      .set({ takeoverUntil: new Date(Date.now() - 1_000) })
      .where(eq(conversationControls.conversationId, conversationId))
      .run();
    expect(control.releaseExpired()).toBe(1);
    expect(control.get(conversationId).mode).not.toBe('HUMAN');

    // Indefinite takeover is never auto-released.
    await aPost(`/conversations/${conversationId}/takeover`, { until: null }).expect(200);
    expect(control.get(conversationId).takeoverUntil).toBeNull();
    expect(control.releaseExpired()).toBe(0);
    expect(control.get(conversationId).mode).toBe('HUMAN');
  });
});

describe('outbound', () => {
  it('queues wa.outbound on owner reply and advances on ack', async () => {
    const conversationId = await openConversation();
    vi.spyOn(wa, 'send').mockResolvedValue({ providerMessageId: 'wa-out-1', duplicate: false });

    const res = await aPost(`/conversations/${conversationId}/messages`, { body: 'Coming up!' });
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
    const id = res.body.id as string;

    expect(control.get(conversationId).mode).toBe('HUMAN');
    expect(countJobs('wa.outbound', 'QUEUED')).toBe(1);

    await t.worker.drain();
    expect(h.db.select().from(messages).where(eq(messages.id, id)).get()!).toMatchObject({
      deliveryState: 'SENT',
      providerMessageId: 'wa-out-1',
    });

    messaging.applyAck({ providerMessageId: 'wa-out-1', clientRef: id, state: 'DELIVERED' });
    expect(h.db.select().from(messages).where(eq(messages.id, id)).get()!.deliveryState).toBe(
      'DELIVERED',
    );
    messaging.applyAck({ providerMessageId: 'wa-out-1', clientRef: id, state: 'READ' });
    expect(h.db.select().from(messages).where(eq(messages.id, id)).get()!.deliveryState).toBe(
      'READ',
    );
  });

  it('marks ERROR after a failed send and re-enqueues on retry', async () => {
    const conversationId = await openConversation();
    vi.spyOn(wa, 'send').mockRejectedValue(new WaServiceError('offline', false));

    const res = await aPost(`/conversations/${conversationId}/messages`, {
      body: 'Try again later',
    });
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
    const id = res.body.id as string;

    await t.worker.drain();
    expect(h.db.select().from(messages).where(eq(messages.id, id)).get()!.deliveryState).toBe(
      'ERROR',
    );

    vi.spyOn(wa, 'send').mockResolvedValue({ providerMessageId: 'wa-retry', duplicate: false });
    await aPost(`/messages/${id}/retry`).expect(200);
    expect(h.db.select().from(messages).where(eq(messages.id, id)).get()!.deliveryState).toBe(
      'PENDING',
    );
    expect(countJobs('wa.outbound', 'QUEUED')).toBe(1);

    await t.worker.drain();
    expect(h.db.select().from(messages).where(eq(messages.id, id)).get()!).toMatchObject({
      deliveryState: 'SENT',
      providerMessageId: 'wa-retry',
    });
  });
});
