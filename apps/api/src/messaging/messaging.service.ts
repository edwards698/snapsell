import { HttpStatus, Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  aiSettings,
  conversations,
  customers,
  type DatabaseHandle,
  integrations,
  messages,
  newId,
} from '@snapsell/db';
import {
  advanceDeliveryState,
  formatPhone,
  normalizePhone,
  type WaAck,
  waAckSchema,
  waEventSchema,
  type WaInboundMessage,
  waInboundMessageSchema,
  type WaStatusSnapshot,
  whatsappIdToE164,
  type WhatsAppStatus,
} from '@snapsell/shared';
import { eq, or, sql } from 'drizzle-orm';
import { type Logger } from 'pino';
import { AuditService } from '../common/audit.service.js';
import { ApiError } from '../common/errors.js';
import { EventBus } from '../common/events.js';
import { DATABASE } from '../database/database.module.js';
import { AUDIO_TYPES, DOCUMENT_TYPES, FileStore, IMAGE_TYPES } from '../files/file-store.js';
import { JobQueue, type JobRow, PermanentJobError } from '../jobs/job-queue.js';
import { JobWorker } from '../jobs/job-worker.js';
import { LOGGER } from '../logging/logging.module.js';
import {
  AI_RESPOND_QUEUE,
  type ControlActor,
  ConversationControlService,
  ensureControl,
} from './conversation-control.service.js';
import { toMessageDto } from './message-dto.js';
import { WaServiceClient, WaServiceError } from './wa-service.client.js';

export const WA_OUTBOUND_QUEUE = 'wa.outbound';
const OUTBOUND_MAX_ATTEMPTS = 4;
/** Waits for a burst (text + photo + voice note) before the assistant answers (Phase 6). */
const AI_DEBOUNCE_MS = 3_000;
const MEDIA_ALLOW = [...IMAGE_TYPES, ...AUDIO_TYPES, ...DOCUMENT_TYPES];

type IntegrationStatus = WhatsAppStatus['status'];

interface WaMetadata {
  detail?: string | null;
  state?: WaStatusSnapshot['state'] | null;
  number?: string | null;
  lastError?: string | null;
  riskAcknowledgedAt?: string | null;
  linkedBefore?: boolean;
}

function integrationStatus(state: WaStatusSnapshot['state'], linkedBefore: boolean) {
  switch (state) {
    case 'READY':
      return 'CONNECTED';
    case 'STARTING':
    case 'QR':
    case 'AUTHENTICATED':
      return 'CONNECTING';
    case 'IDLE':
      return linkedBefore ? 'DISCONNECTED' : 'NOT_CONFIGURED';
    default:
      return 'DISCONNECTED';
  }
}

/**
 * The WhatsApp channel inside the API: receives events from the WhatsApp service, stores
 * conversations and messages, and sends owner replies through the `wa.outbound` queue.
 */
@Injectable()
export class MessagingService implements OnModuleInit {
  /** Latest QR code – kept in memory only, never written to the database. */
  private qr: string | null = null;
  /** Whether the last contact with the WhatsApp service succeeded (null = not tried yet). */
  private reachable: { ok: boolean; error: string | null } | null = null;

  constructor(
    @Inject(DATABASE) private readonly handle: DatabaseHandle,
    @Inject(LOGGER) private readonly logger: Logger,
    private readonly queue: JobQueue,
    private readonly worker: JobWorker,
    private readonly files: FileStore,
    private readonly events: EventBus,
    private readonly audit: AuditService,
    private readonly control: ConversationControlService,
    private readonly wa: WaServiceClient,
  ) {}

  onModuleInit() {
    this.worker.register<{ messageId: string }>(
      WA_OUTBOUND_QUEUE,
      (payload, job) => this.deliver(payload.messageId, job),
      { concurrency: 1, lockMs: 60_000 },
    );
  }

  /** Queues a stored outbound message. The WhatsApp service dedupes on the message id. */
  enqueueOutbound(messageId: string) {
    this.queue.enqueue(
      WA_OUTBOUND_QUEUE,
      { messageId },
      { dedupeKey: `${WA_OUTBOUND_QUEUE}:${messageId}`, maxAttempts: OUTBOUND_MAX_ATTEMPTS },
    );
  }

  /**
   * Sends a backend-rendered template (payment outcome, etc.) as the assistant or system.
   * Used by payments — not by free-form AI replies.
   */
  sendTemplate(
    conversationId: string,
    body: string,
    author: 'AI' | 'SYSTEM' = 'SYSTEM',
  ) {
    const { db } = this.handle;
    const conversation = db
      .select({ id: conversations.id, customerName: customers.fullName })
      .from(conversations)
      .innerJoin(customers, eq(customers.id, conversations.customerId))
      .where(eq(conversations.id, conversationId))
      .get();
    if (!conversation) return null;
    const now = new Date();
    const message = db.transaction((tx) => {
      const row = tx
        .insert(messages)
        .values({
          id: newId(),
          conversationId,
          direction: 'OUT',
          author,
          type: 'TEXT',
          body,
          deliveryState: 'PENDING',
          aiDraftStatus: author === 'AI' ? 'APPROVED' : 'NONE',
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      tx.update(conversations)
        .set({ lastMessageAt: now })
        .where(eq(conversations.id, conversationId))
        .run();
      this.enqueueOutbound(row.id);
      return row;
    });
    const dto = toMessageDto(message, this.files);
    this.events.emit('message.new', {
      conversationId,
      customerName: conversation.customerName,
      message: dto,
    });
    this.events.emit('conversation.updated', { conversationId });
    return dto;
  }

  // ---------------------------------------------------------------------------
  // Events from the WhatsApp service
  // ---------------------------------------------------------------------------

  handleEvent(raw: unknown) {
    const parsed = waEventSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Invalid event.');
    }
    const event = parsed.data;
    switch (event.kind) {
      case 'status':
        return { result: this.applyStatus(event.status) };
      case 'message':
        return { result: this.receive(event.message) };
      case 'ack':
        return { result: this.applyAck(event.ack) };
    }
  }

  async saveMedia(body: Buffer) {
    const stored = await this.files.savePrivate(body, { allow: MEDIA_ALLOW });
    return { fileKey: stored.key, mime: stored.mime, size: stored.size };
  }

  /** Stores an inbound message once; a redelivered message is a no-op. */
  receive(input: WaInboundMessage) {
    const m = waInboundMessageSchema.parse(input);
    const phone =
      (m.phone ? normalizePhone(`+${m.phone.replace(/\D/g, '')}`) : null) ??
      whatsappIdToE164(m.chatId);
    if (!phone) {
      this.logger.warn(
        { providerMessageId: m.providerMessageId },
        'Inbound message without a phone',
      );
      return 'ignored' as const;
    }
    const { db } = this.handle;
    const now = new Date();
    const sentAt = new Date(m.timestamp);

    const stored = db.transaction((tx) => {
      const exists = tx
        .select({ id: messages.id })
        .from(messages)
        .where(eq(messages.providerMessageId, m.providerMessageId))
        .get();
      if (exists) return null;

      let customer = tx
        .select()
        .from(customers)
        .where(or(eq(customers.whatsappId, m.chatId), eq(customers.phoneE164, phone)))
        .get();
      if (!customer) {
        customer = tx
          .insert(customers)
          .values({
            id: newId(),
            fullName: m.pushName?.trim() || formatPhone(phone),
            phoneE164: phone,
            whatsappId: m.chatId,
          })
          .returning()
          .get();
      } else if (!customer.whatsappId) {
        tx.update(customers)
          .set({ whatsappId: m.chatId })
          .where(eq(customers.id, customer.id))
          .run();
      }

      let conversation = tx
        .select()
        .from(conversations)
        .where(eq(conversations.channelAddress, m.chatId))
        .get();
      if (!conversation) {
        conversation = tx
          .insert(conversations)
          .values({ id: newId(), customerId: customer.id, channelAddress: m.chatId })
          .returning()
          .get();
      }
      const globalMode = tx.select({ mode: aiSettings.mode }).from(aiSettings).get()?.mode;
      ensureControl(tx, conversation.id, globalMode === 'AUTO' ? 'AI_AUTO' : 'AI_SUGGEST');

      const message = tx
        .insert(messages)
        .values({
          id: newId(),
          conversationId: conversation.id,
          providerMessageId: m.providerMessageId,
          direction: 'IN',
          author: 'CUSTOMER',
          type: m.type,
          body: m.body ?? (m.mediaError ? `[${m.mediaError}]` : null),
          media: m.media
            ? { mime: m.media.mime, size: m.media.size, fileKey: m.media.fileKey, expiresAt: null }
            : null,
          quotedProviderMessageId: m.quotedProviderMessageId,
          createdAt: sentAt,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning()
        .get();
      if (!message) return null;

      tx.update(conversations)
        .set({
          unreadCount: sql`${conversations.unreadCount} + 1`,
          lastMessageAt: sql`max(coalesce(${conversations.lastMessageAt}, 0), ${sentAt.getTime()})`,
        })
        .where(eq(conversations.id, conversation.id))
        .run();

      this.queue.coalesce(
        AI_RESPOND_QUEUE,
        conversation.id,
        { conversationId: conversation.id },
        { delayMs: AI_DEBOUNCE_MS },
      );
      return { message, customerName: customer.fullName };
    });

    if (!stored) return 'duplicate' as const;
    this.events.emit('message.new', {
      conversationId: stored.message.conversationId,
      customerName: stored.customerName,
      message: toMessageDto(stored.message, this.files),
    });
    this.events.emit('conversation.updated', { conversationId: stored.message.conversationId });
    return 'stored' as const;
  }

  applyAck(input: WaAck) {
    const a = waAckSchema.parse(input);
    const { db } = this.handle;
    const row = db
      .select()
      .from(messages)
      .where(
        a.clientRef
          ? or(eq(messages.id, a.clientRef), eq(messages.providerMessageId, a.providerMessageId))
          : eq(messages.providerMessageId, a.providerMessageId),
      )
      .get();
    if (!row || row.direction !== 'OUT') return 'ignored' as const;
    const next = advanceDeliveryState(row.deliveryState, a.state);
    if (next === row.deliveryState && row.providerMessageId) return 'unchanged' as const;
    const updated = db
      .update(messages)
      .set({ deliveryState: next, providerMessageId: row.providerMessageId ?? a.providerMessageId })
      .where(eq(messages.id, row.id))
      .returning()
      .get()!;
    this.events.emit('message.updated', {
      conversationId: updated.conversationId,
      message: toMessageDto(updated, this.files),
    });
    return 'updated' as const;
  }

  applyStatus(snapshot: WaStatusSnapshot) {
    const wasUnreachable = this.reachable?.ok === false;
    this.reachable = { ok: true, error: null };
    this.qr = snapshot.state === 'QR' ? snapshot.qr : null;
    const current = this.integration();
    const meta = current.metadata;
    const linkedBefore = !!meta.linkedBefore || snapshot.state === 'READY';
    const status = integrationStatus(snapshot.state, linkedBefore);
    const number = snapshot.state === 'READY' ? snapshot.number : (meta.number ?? null);
    const next: WaMetadata = {
      ...meta,
      state: snapshot.state,
      number,
      linkedBefore,
      lastError: snapshot.error ?? (snapshot.state === 'READY' ? null : (meta.lastError ?? null)),
      detail: number ? formatPhone(number) : null,
    };
    const changed =
      current.status !== status ||
      meta.state !== next.state ||
      meta.number !== next.number ||
      meta.lastError !== next.lastError;
    if (changed) {
      this.handle.db
        .update(integrations)
        .set({ status, metadata: next as Record<string, unknown> })
        .where(eq(integrations.kind, 'WHATSAPP'))
        .run();
      if (current.status !== status) {
        this.logger.info(
          { status, state: snapshot.state, event: snapshot.event },
          'WhatsApp status',
        );
      }
    }
    // QR codes rotate every ~20 s; always forward them.
    if (changed || wasUnreachable || snapshot.state === 'QR') {
      this.events.emit('whatsapp.status', this.status());
    }
    return status;
  }

  // ---------------------------------------------------------------------------
  // Integration (admin)
  // ---------------------------------------------------------------------------

  status(): WhatsAppStatus {
    const row = this.integration();
    const meta = row.metadata;
    const reachable = this.reachable?.ok ?? true;
    return {
      status: row.status as WhatsAppStatus['status'],
      state: reachable ? (meta.state ?? null) : 'UNREACHABLE',
      number: meta.number ?? null,
      qr: reachable ? this.qr : null,
      lastError: (reachable ? null : this.reachable?.error) ?? meta.lastError ?? null,
      serviceReachable: reachable,
      riskAcknowledgedAt: meta.riskAcknowledgedAt ?? null,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /** Current status, refreshed from the service when it is reachable. */
  async liveStatus(): Promise<WhatsAppStatus> {
    try {
      this.applyStatus(await this.wa.status());
    } catch (err) {
      const error = err instanceof Error ? err.message : 'The WhatsApp service is not running.';
      const changed = this.reachable?.ok !== false;
      this.reachable = { ok: false, error };
      this.qr = null;
      if (changed) this.events.emit('whatsapp.status', this.status());
    }
    return this.status();
  }

  acknowledgeRisk(actor: ControlActor & { type: 'OWNER' }) {
    const row = this.integration();
    const at = new Date().toISOString();
    this.handle.db
      .update(integrations)
      .set({ metadata: { ...row.metadata, riskAcknowledgedAt: at } })
      .where(eq(integrations.kind, 'WHATSAPP'))
      .run();
    this.audit.record({
      actor: 'OWNER',
      actorId: actor.id,
      action: 'whatsapp.risk_acknowledged',
      entity: 'integration',
      entityId: 'WHATSAPP',
    });
    const status = this.status();
    this.events.emit('whatsapp.status', status);
    return status;
  }

  async runCommand(command: 'connect' | 'reconnect' | 'disconnect', actor: { id: string }) {
    if (command !== 'disconnect' && !this.integration().metadata.riskAcknowledgedAt) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        'RISK_NOT_ACKNOWLEDGED',
        'Read and accept the WhatsApp warning first.',
      );
    }
    const map = { connect: 'qr', reconnect: 'restart', disconnect: 'logout' } as const;
    try {
      await this.wa.command(map[command]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'WhatsApp service error.';
      await this.liveStatus();
      throw new ApiError(HttpStatus.BAD_GATEWAY, 'WHATSAPP_UNAVAILABLE', message);
    }
    this.audit.record({
      actor: 'OWNER',
      actorId: actor.id,
      action: `whatsapp.${command}`,
      entity: 'integration',
      entityId: 'WHATSAPP',
    });
    if (command === 'disconnect') {
      this.qr = null;
      const row = this.integration();
      this.handle.db
        .update(integrations)
        .set({
          status: 'NOT_CONFIGURED',
          metadata: {
            ...row.metadata,
            state: 'IDLE',
            number: null,
            detail: null,
            lastError: null,
            linkedBefore: false,
          },
        })
        .where(eq(integrations.kind, 'WHATSAPP'))
        .run();
      this.events.emit('whatsapp.status', this.status());
    }
    return this.liveStatus();
  }

  // ---------------------------------------------------------------------------
  // Outbound
  // ---------------------------------------------------------------------------

  /** Stores an owner reply and queues it for sending. */
  sendOwnerMessage(conversationId: string, body: string, actor: { id: string }) {
    const { db } = this.handle;
    const conversation = db
      .select({ id: conversations.id, customerName: customers.fullName })
      .from(conversations)
      .innerJoin(customers, eq(customers.id, conversations.customerId))
      .where(eq(conversations.id, conversationId))
      .get();
    if (!conversation) {
      throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Conversation not found.');
    }
    const now = new Date();
    const message = db.transaction((tx) => {
      const row = tx
        .insert(messages)
        .values({
          id: newId(),
          conversationId,
          direction: 'OUT',
          author: 'OWNER',
          type: 'TEXT',
          body,
          deliveryState: 'PENDING',
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      tx.update(conversations)
        .set({ lastMessageAt: now, unreadCount: 0 })
        .where(eq(conversations.id, conversationId))
        .run();
      this.enqueueOutbound(row.id);
      return row;
    });

    // Replying by hand means the owner is handling this chat (spec §4.4); configurable.
    const control = this.control.get(conversationId);
    if (control.mode !== 'HUMAN' && this.ownerReplySetsHuman()) {
      this.control.takeover(conversationId, null, { type: 'OWNER', id: actor.id });
    }

    const dto = toMessageDto(message, this.files);
    this.events.emit('message.new', {
      conversationId,
      customerName: conversation.customerName,
      message: dto,
    });
    this.events.emit('conversation.updated', { conversationId });
    return dto;
  }

  retry(messageId: string) {
    const { db } = this.handle;
    const row = db.select().from(messages).where(eq(messages.id, messageId)).get();
    if (!row || row.direction !== 'OUT') {
      throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Message not found.');
    }
    if (row.deliveryState !== 'ERROR') {
      throw new ApiError(HttpStatus.CONFLICT, 'NOT_FAILED', 'Only failed messages can be retried.');
    }
    const updated = db.transaction((tx) => {
      const u = tx
        .update(messages)
        .set({ deliveryState: 'PENDING' })
        .where(eq(messages.id, messageId))
        .returning()
        .get()!;
      this.queue.enqueue(
        WA_OUTBOUND_QUEUE,
        { messageId },
        {
          dedupeKey: `${WA_OUTBOUND_QUEUE}:${messageId}:${Date.now()}`,
          maxAttempts: OUTBOUND_MAX_ATTEMPTS,
        },
      );
      return u;
    });
    const dto = toMessageDto(updated, this.files);
    this.events.emit('message.updated', { conversationId: updated.conversationId, message: dto });
    return dto;
  }

  /** `wa.outbound` handler. The service dedupes on `clientRef`, so a retry never double-sends. */
  private async deliver(messageId: string, job: JobRow) {
    const { db } = this.handle;
    const row = db.select().from(messages).where(eq(messages.id, messageId)).get();
    if (!row) return;
    if (row.deliveryState && !['PENDING', 'ERROR'].includes(row.deliveryState)) return;
    const conversation = db
      .select({ chatId: conversations.channelAddress })
      .from(conversations)
      .where(eq(conversations.id, row.conversationId))
      .get();
    if (!conversation || !row.body) {
      this.markFailed(messageId, 'Nothing to send.');
      throw new PermanentJobError('Nothing to send');
    }
    try {
      const result = await this.wa.send({
        clientRef: row.id,
        chatId: conversation.chatId,
        body: row.body,
      });
      const current = db.select().from(messages).where(eq(messages.id, messageId)).get()!;
      const updated = db
        .update(messages)
        .set({
          providerMessageId: current.providerMessageId ?? result.providerMessageId,
          deliveryState: advanceDeliveryState(
            current.deliveryState === 'ERROR' ? 'PENDING' : current.deliveryState,
            'SENT',
          ),
        })
        .where(eq(messages.id, messageId))
        .returning()
        .get()!;
      this.events.emit('message.updated', {
        conversationId: updated.conversationId,
        message: toMessageDto(updated, this.files),
      });
    } catch (err) {
      const final =
        (err instanceof WaServiceError && !err.retryable) || job.attempts >= job.maxAttempts;
      if (final) {
        this.markFailed(messageId, err instanceof Error ? err.message : String(err));
        throw new PermanentJobError(err instanceof Error ? err.message : String(err));
      }
      throw err;
    }
  }

  private markFailed(messageId: string, reason: string) {
    const updated = this.handle.db
      .update(messages)
      .set({ deliveryState: 'ERROR' })
      .where(eq(messages.id, messageId))
      .returning()
      .get();
    if (!updated) return;
    this.logger.warn({ messageId, reason }, 'WhatsApp message could not be sent');
    this.events.emit('message.updated', {
      conversationId: updated.conversationId,
      message: toMessageDto(updated, this.files),
    });
  }

  private ownerReplySetsHuman() {
    const row = this.handle.sqlite
      .prepare(`select features from ai_settings where id = 1`)
      .get() as { features: string | null } | undefined;
    const features = row?.features ? (JSON.parse(row.features) as Record<string, boolean>) : {};
    return features.ownerReplySetsHuman !== false;
  }

  private integration() {
    const row = this.handle.db
      .select()
      .from(integrations)
      .where(eq(integrations.kind, 'WHATSAPP'))
      .get();
    if (row) return row as typeof row & { metadata: WaMetadata };
    return this.handle.db
      .insert(integrations)
      .values({ kind: 'WHATSAPP' })
      .returning()
      .get() as typeof integrations.$inferSelect & { metadata: WaMetadata };
  }
}
