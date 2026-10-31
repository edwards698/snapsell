import { HttpStatus, Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  aiActivityLogs,
  aiSettings,
  businessSettings,
  conversations,
  customers,
  type DatabaseHandle,
  messages,
  newId,
  presetResponses,
} from '@snapsell/db';
import {
  AiOutcome,
  parseAiFeatures,
  type SandboxResult,
  type SandboxToolCall,
} from '@snapsell/shared';
import { and, desc, eq, sql } from 'drizzle-orm';
import { type Logger } from 'pino';
import { z } from 'zod';
import { ApiError } from '../common/errors.js';
import { EventBus } from '../common/events.js';
import { DATABASE } from '../database/database.module.js';
import { FileStore } from '../files/file-store.js';
import { JobWorker } from '../jobs/job-worker.js';
import { LOGGER } from '../logging/logging.module.js';
import {
  AI_RESPOND_QUEUE,
  ConversationControlService,
} from '../messaging/conversation-control.service.js';
import { toMessageDto } from '../messaging/message-dto.js';
import { MessagingService } from '../messaging/messaging.service.js';
import { WhatsAppOrdersService } from '../orders/whatsapp-orders.service.js';
import { looksLikePaymentClaim } from './affirmative.js';
import { AI_PROVIDER, type AiProvider, AiUnavailableError, type ToolCallRecord } from './ai.provider.js';
import {
  type ConversationContext,
  EMPTY_CONTEXT,
  FINISH_TOOL,
  historyContents,
  isPresetKey,
  packHistory,
  readContext,
  splitTurn,
  SUMMARY_SCHEMA,
  systemInstruction,
} from './context.js';
import { hasUngroundedPrice } from './grounding.js';
import { isWithinHours } from './hours.js';
import { partsForTurn } from './media.js';
import { decideSend, skipModel } from './sending-gate.js';
import { executeTool, toolDeclarations } from './tools.js';

/** Soft cap per conversation per day before the assistant hands over. */
const MAX_TURNS_PER_CONVERSATION_DAY = 40;
/** Soft daily token budget across the shop (alert only). */
const DAILY_TOKEN_ALERT = 200_000;

const finishSchema = z.object({
  reply: z.string().trim().min(1).max(4000),
  interpretation: z.string().trim().max(500).optional().default(''),
  confidence: z.coerce.number().min(0).max(100).catch(40),
  presetKey: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? ''),
  pendingQuestion: z.string().max(300).nullable().optional(),
  productRefs: z.array(z.string().max(40)).max(8).optional(),
  known: z
    .array(
      z.object({
        key: z.string().trim().min(1).max(40),
        value: z.string().trim().min(1).max(200),
        provenance: z.enum(['customer_said', 'database', 'ai_inferred']),
      }),
    )
    .max(12)
    .optional(),
});

type Finish = z.infer<typeof finishSchema>;
type Outcome = z.infer<typeof AiOutcome>;

/** One assistant turn: catalogue tools, a sending gate, and either a draft or a WhatsApp send. */
@Injectable()
export class AiTurnService implements OnModuleInit {
  constructor(
    @Inject(DATABASE) private readonly handle: DatabaseHandle,
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
    @Inject(LOGGER) private readonly logger: Logger,
    private readonly worker: JobWorker,
    private readonly files: FileStore,
    private readonly events: EventBus,
    private readonly control: ConversationControlService,
    private readonly messaging: MessagingService,
    private readonly waOrders: WhatsAppOrdersService,
  ) {}

  onModuleInit() {
    this.worker.register<{ conversationId: string }>(
      AI_RESPOND_QUEUE,
      (payload) => this.respond(payload.conversationId),
      { concurrency: 1, lockMs: 120_000 },
    );
  }

  /** Answers every inbound message since the last assistant turn, as one reply. */
  async respond(conversationId: string) {
    const { db } = this.handle;
    const conversation = db
      .select({
        id: conversations.id,
        customerId: conversations.customerId,
        customerName: customers.fullName,
        summary: conversations.summary,
        context: conversations.context,
      })
      .from(conversations)
      .innerJoin(customers, eq(customers.id, conversations.customerId))
      .where(eq(conversations.id, conversationId))
      .get();
    if (!conversation) return;

    const settings = this.settings();
    const shop = db.select().from(businessSettings).get()!;
    const control = this.control.get(conversationId);
    const blocked = skipModel({
      enabled: settings.enabled,
      globalMode: settings.mode,
      conversationMode: control.mode,
    });
    if (blocked) {
      this.record({
        conversationId,
        outcome: 'DROPPED',
        interpretation: blocked,
        inputTypes: [],
      });
      return;
    }

    const history = db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt))
      .limit(80)
      .all()
      .reverse();
    const { prior, current } = splitTurn(
      history.map((m) => ({
        id: m.id,
        direction: m.direction,
        author: m.author,
        body: m.body,
        aiDraftStatus: m.aiDraftStatus,
      })),
    );
    if (current.length === 0) {
      this.record({
        conversationId,
        outcome: 'DROPPED',
        interpretation: 'Nothing new to answer',
        inputTypes: [],
      });
      return;
    }
    if (this.turnsToday(conversationId) >= MAX_TURNS_PER_CONVERSATION_DAY) {
      this.control.takeover(conversationId, null, { type: 'SYSTEM' });
      this.record({
        conversationId,
        outcome: 'ESCALATED',
        interpretation: 'Conversation hit the daily AI turn limit',
        inputTypes: [],
      });
      return;
    }
    const inputTypes = [...new Set(current.map((m) => history.find((row) => row.id === m.id)!.type))];
    const lastCustomerText = current
      .map((m) => m.body ?? '')
      .filter(Boolean)
      .join('\n');
    const open = isWithinHours(shop.openingHours, new Date(), shop.timezone);
    const gateBase = {
      enabled: settings.enabled,
      globalMode: settings.mode,
      conversationMode: control.mode,
      generationAtStart: control.generation,
      confidenceThreshold: settings.confidenceThreshold,
      withinHours: open,
      hasAfterHoursMessage: !!settings.afterHoursMessage?.trim(),
    };

    if (!open) {
      const body = settings.afterHoursMessage?.trim() ?? '';
      const decision = decideSend({
        ...gateBase,
        generationNow: control.generation,
        confidence: 100,
        duplicate: this.isDuplicate(conversationId, body),
        handover: false,
      });
      const saved = this.applyDecision(conversation, body, decision);
      this.record({
        conversationId,
        messageId: saved,
        outcome: decision.outcome,
        interpretation: decision.reason ?? 'Outside opening hours',
        response: decision.action === 'drop' ? null : body,
        inputTypes,
      });
      return;
    }

    if (!this.ai.configured) {
      this.record({
        conversationId,
        outcome: 'ERROR',
        interpretation: 'GEMINI_API_KEY is not set',
        inputTypes,
      });
      return;
    }

    let context = readContext(conversation.context);
    let summary = conversation.summary;
    const packed = packHistory(prior);
    if (packed.head.length > 0) {
      const through = packed.head[packed.head.length - 1]!.id;
      if (context.summarizedThroughId !== through) {
        summary = await this.summarize(summary, packed.head);
        context = { ...context, summarizedThroughId: through };
        db.update(conversations)
          .set({ summary, context: context as unknown as Record<string, unknown> })
          .where(eq(conversations.id, conversationId))
          .run();
      }
    }

    const features = settings.features;
    const currentRows = current.map((m) => history.find((row) => row.id === m.id)!);
    const flags: { handover: { reason: string; summary: string } | null } = { handover: null };
    let result;
    try {
      const media = await partsForTurn(
        currentRows.map((m) => ({ type: m.type, body: m.body, media: m.media })),
        features,
        this.files,
      );
      if (looksLikePaymentClaim(lastCustomerText)) {
        media.unshift({
          text: 'System note: the customer claims they paid or sent a screenshot. Call get_order_status. Never say the payment succeeded unless payment_status is PAID.',
        });
      }
      const contents = historyContents(packed.tail);
      contents.push({ role: 'user', parts: media });
      const orderOps = {
        createDraft: (input: {
          items: Array<{ variantId: string; quantity: number }>;
          fulfilmentMethod?: 'DELIVERY' | 'COLLECTION';
          address?: {
            line1: string;
            line2?: string;
            area?: string;
            city?: string;
            notes?: string;
          } | null;
          customerName?: string;
        }) =>
          this.waOrders.createOrUpdateDraft(
            conversationId,
            conversation.customerId,
            input,
            { create: true },
          ),
        updateDraft: (input: {
          items?: Array<{ variantId: string; quantity: number }>;
          fulfilmentMethod?: 'DELIVERY' | 'COLLECTION';
          address?: {
            line1: string;
            line2?: string;
            area?: string;
            city?: string;
            notes?: string;
          } | null;
          customerName?: string;
        }) =>
          this.waOrders.createOrUpdateDraft(
            conversationId,
            conversation.customerId,
            input,
            { create: false },
          ),
        calculate: (draftId: string) => this.waOrders.calculate(conversationId, draftId),
        confirm: (quoteId: string) =>
          this.waOrders.confirm(conversationId, quoteId, lastCustomerText),
        generatePaymentLink: (orderRef: string) =>
          this.waOrders.generatePaymentLink(conversationId, orderRef, {
            autoSend: features.paymentAutoSend,
          }),
      };
      result = await this.ai.generateWithTools({
        system: systemInstruction({
          shopName: shop.name,
          currency: shop.currency,
          style: settings.responseStyle,
          tone: settings.tone,
          language: settings.language,
          open,
          features,
          escalationTopics: settings.escalationTopics,
          context,
          summary,
        }),
        contents,
        tools: [
          ...toolDeclarations(features),
          FINISH_TOOL as typeof FINISH_TOOL & { parameters: Record<string, unknown> },
        ],
        execute: (name, args) =>
          executeTool(name, args, {
            sqlite: this.handle.sqlite,
            customerId: conversation.customerId,
            conversationId,
            currency: shop.currency,
            productEnquiries: features.productEnquiries,
            stockEnquiries: features.stockEnquiries,
            showExactStock: features.showExactStock,
            orderAssistance: features.orderAssistance,
            draftOrders: features.draftOrders,
            lastCustomerMessage: lastCustomerText,
            orders: orderOps,
            onHandover: (reason, summaryText) => {
              flags.handover = { reason, summary: summaryText };
            },
          }),
      });
    } catch (err) {
      this.record({
        conversationId,
        outcome: 'ERROR',
        interpretation: err instanceof Error ? err.message : 'The assistant failed',
        inputTypes,
        toolCalls: [],
      });
      if (err instanceof AiUnavailableError) return;
      throw err;
    }

    const nowControl = this.control.get(conversationId);
    if (nowControl.generation !== control.generation) {
      this.record({
        conversationId,
        outcome: 'DROPPED',
        interpretation: 'The conversation changed while the reply was being written',
        response: null,
        inputTypes,
        toolCalls: result.toolCalls,
        latencyMs: result.latencyMs,
        tokens: result.tokens,
      });
      return;
    }

    const parsed = parseFinish(result.finish, result.text);
    if (!parsed) {
      this.record({
        conversationId,
        outcome: 'DROPPED',
        interpretation: 'The assistant did not produce a reply',
        inputTypes,
        toolCalls: result.toolCalls,
        latencyMs: result.latencyMs,
        tokens: result.tokens,
      });
      return;
    }

    this.writeContext(conversationId, context, parsed);
    let body = parsed.reply;
    let confidence = parsed.confidence;
    let interpretation = parsed.interpretation;
    if (isPresetKey(parsed.presetKey)) {
      const preset = db
        .select()
        .from(presetResponses)
        .where(eq(presetResponses.key, parsed.presetKey))
        .get();
      if (preset?.enabled) body = preset.text;
    } else if (hasUngroundedPrice(body, JSON.stringify(result.toolCalls))) {
      confidence = 0;
      interpretation = `${interpretation} Reply mentioned a price that was not in the catalogue.`.trim();
    }
    const blocks = requiredBlocks(result.toolCalls);
    for (const block of blocks) {
      if (!body.includes(block)) {
        confidence = 0;
        interpretation =
          `${interpretation} Backend summary or payment message was altered.`.trim();
        break;
      }
    }

    if (flags.handover) {
      this.control.takeover(conversationId, null, { type: 'SYSTEM' });
      this.handle.db
        .update(conversations)
        .set({ unreadCount: sql`${conversations.unreadCount} + 1` })
        .where(eq(conversations.id, conversationId))
        .run();
      this.logger.warn(
        {
          conversationId,
          reason: flags.handover.reason,
          summary: flags.handover.summary.slice(0, 300),
        },
        'AI handed conversation to owner',
      );
    }
    const decision = decideSend({
      ...gateBase,
      conversationMode: flags.handover ? control.mode : nowControl.mode,
      generationNow: flags.handover ? control.generation : nowControl.generation,
      confidence,
      duplicate: this.isDuplicate(conversationId, body),
      handover: !!flags.handover,
    });
    const saved = this.applyDecision(conversation, body, decision);
    // Only mark the quote presented once the summary is actually outbound (not a suggest draft).
    if (saved && decision.action === 'send') {
      this.waOrders.markPresented(conversationId, saved, body);
    }
    this.record({
      conversationId,
      messageId: saved,
      outcome: decision.outcome,
      interpretation: decision.reason ?? interpretation,
      response: body,
      inputTypes,
      toolCalls: result.toolCalls,
      latencyMs: result.latencyMs,
      tokens: result.tokens,
    });
    this.maybeSpendAlert(result.tokens);
  }

  /** One turn against the live catalogue. Nothing is stored as a conversation message. */
  async sandbox(message: string): Promise<SandboxResult> {
    if (!this.ai.configured) {
      throw new ApiError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'AI_NOT_CONFIGURED',
        'Add GEMINI_API_KEY to .env and restart the API.',
      );
    }
    const settings = this.settings();
    const shop = this.handle.db.select().from(businessSettings).get()!;
    const features = settings.features;
    const flags = { handover: false };
    const result = await this.ai.generateWithTools({
      system: systemInstruction({
        shopName: shop.name,
        currency: shop.currency,
        style: settings.responseStyle,
        tone: settings.tone,
        language: settings.language,
        open: isWithinHours(shop.openingHours, new Date(), shop.timezone),
        features,
        escalationTopics: settings.escalationTopics,
        context: EMPTY_CONTEXT,
        summary: null,
      }),
      contents: [{ role: 'user', parts: [{ text: message }] }],
      tools: [
        ...toolDeclarations({ ...features, orderAssistance: false, draftOrders: false }),
        FINISH_TOOL as typeof FINISH_TOOL & { parameters: Record<string, unknown> },
      ],
      execute: (name, args) =>
        executeTool(name, args, {
          sqlite: this.handle.sqlite,
          customerId: null,
          conversationId: null,
          currency: shop.currency,
          productEnquiries: features.productEnquiries,
          stockEnquiries: features.stockEnquiries,
          showExactStock: features.showExactStock,
          orderAssistance: false,
          draftOrders: false,
          lastCustomerMessage: message,
          onHandover: () => {
            flags.handover = true;
          },
        }),
    });
    const parsed = parseFinish(result.finish, result.text);
    const reply = parsed?.reply ?? '';
    const outcome: Outcome = flags.handover ? 'ESCALATED' : 'SUGGESTED';
    this.record({
      conversationId: null,
      outcome,
      interpretation: parsed?.interpretation || 'Sandbox',
      response: reply,
      inputTypes: ['TEXT'],
      toolCalls: result.toolCalls,
      latencyMs: result.latencyMs,
      tokens: result.tokens,
    });
    return {
      reply,
      interpretation: parsed?.interpretation ?? '',
      confidence: parsed?.confidence ?? 0,
      toolCalls: result.toolCalls as SandboxToolCall[],
      outcome,
    };
  }

  approveDraft(conversationId: string, messageId: string, body?: string) {
    const { db } = this.handle;
    const row = db.select().from(messages).where(eq(messages.id, messageId)).get();
    if (!row || row.conversationId !== conversationId) {
      throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Draft not found.');
    }
    if (row.aiDraftStatus !== 'DRAFT' || row.author !== 'AI') {
      throw new ApiError(HttpStatus.CONFLICT, 'NOT_A_DRAFT', 'That message is not a draft waiting to send.');
    }
    const nextBody = body?.trim() || row.body;
    if (!nextBody) {
      throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Write a message first.');
    }
    const updated = db.transaction((tx) => {
      const message = tx
        .update(messages)
        .set({ body: nextBody, aiDraftStatus: 'APPROVED', deliveryState: 'PENDING' })
        .where(eq(messages.id, messageId))
        .returning()
        .get()!;
      this.messaging.enqueueOutbound(message.id);
      return message;
    });
    this.waOrders.markPresented(conversationId, updated.id, nextBody);
    const dto = toMessageDto(updated, this.files);
    this.events.emit('message.updated', { conversationId, message: dto });
    this.events.emit('conversation.updated', { conversationId });
    return dto;
  }

  discardDraft(conversationId: string, messageId: string) {
    const row = this.handle.db.select().from(messages).where(eq(messages.id, messageId)).get();
    if (!row || row.conversationId !== conversationId || row.aiDraftStatus !== 'DRAFT') {
      throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Draft not found.');
    }
    const updated = this.handle.db
      .update(messages)
      .set({ aiDraftStatus: 'REJECTED' })
      .where(eq(messages.id, messageId))
      .returning()
      .get()!;
    const dto = toMessageDto(updated, this.files);
    this.events.emit('message.updated', { conversationId, message: dto });
    return dto;
  }

  private applyDecision(
    conversation: { id: string; customerName: string },
    body: string,
    decision: { action: 'send' | 'draft' | 'drop' },
  ): string | null {
    if (decision.action === 'drop' || !body.trim()) return null;
    const now = new Date();
    const send = decision.action === 'send';
    const { message, retired } = this.handle.db.transaction((tx) => {
      const retired = tx
        .update(messages)
        .set({ aiDraftStatus: 'REJECTED' })
        .where(and(eq(messages.conversationId, conversation.id), eq(messages.aiDraftStatus, 'DRAFT')))
        .returning()
        .all();
      const message = tx
        .insert(messages)
        .values({
          id: newId(),
          conversationId: conversation.id,
          direction: 'OUT',
          author: 'AI',
          type: 'TEXT',
          body,
          aiDraftStatus: send ? 'APPROVED' : 'DRAFT',
          deliveryState: send ? 'PENDING' : null,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      tx.update(conversations)
        .set({ lastMessageAt: now })
        .where(eq(conversations.id, conversation.id))
        .run();
      if (send) this.messaging.enqueueOutbound(message.id);
      return { message, retired };
    });
    for (const old of retired) {
      this.events.emit('message.updated', {
        conversationId: conversation.id,
        message: toMessageDto(old, this.files),
      });
    }
    this.events.emit('message.new', {
      conversationId: conversation.id,
      customerName: conversation.customerName,
      message: toMessageDto(message, this.files),
    });
    this.events.emit('conversation.updated', { conversationId: conversation.id });
    return message.id;
  }

  private writeContext(conversationId: string, current: ConversationContext, parsed: Finish) {
    const known = [...current.known];
    for (const item of parsed.known ?? []) {
      const index = known.findIndex((k) => k.key === item.key);
      if (index >= 0 && known[index]!.provenance === 'customer_said' && item.provenance !== 'customer_said') {
        continue;
      }
      if (index >= 0) known[index] = item;
      else known.push(item);
    }
    const context: ConversationContext = {
      known: known.slice(-12),
      productRefs: parsed.productRefs?.length ? parsed.productRefs : current.productRefs,
      pendingQuestion: parsed.pendingQuestion ?? null,
      summarizedThroughId: current.summarizedThroughId,
    };
    this.handle.db
      .update(conversations)
      .set({ context: context as unknown as Record<string, unknown> })
      .where(eq(conversations.id, conversationId))
      .run();
  }

  private async summarize(
    previous: string | null,
    head: Array<{ author: string; body: string | null }>,
  ): Promise<string | null> {
    const transcript = head
      .map((m) => `${m.author}: ${m.body ?? ''}`)
      .join('\n')
      .slice(0, 12_000);
    try {
      const raw = await this.ai.generateJson(
        [
          {
            text: `Summarise this shop conversation in under 120 words. Keep names, products, quantities and unanswered questions.\nPrevious summary: ${previous ?? 'none'}\n\n${transcript}`,
          },
        ],
        SUMMARY_SCHEMA as unknown as Record<string, unknown>,
        { temperature: 0.2 },
      );
      const parsed = z.object({ summary: z.string().trim().max(2000) }).safeParse(raw);
      return parsed.success && parsed.data.summary ? parsed.data.summary : previous;
    } catch {
      return previous;
    }
  }

  private isDuplicate(conversationId: string, body: string) {
    const last = this.handle.db
      .select({ body: messages.body, aiDraftStatus: messages.aiDraftStatus })
      .from(messages)
      .where(and(eq(messages.conversationId, conversationId), eq(messages.direction, 'OUT')))
      .orderBy(desc(messages.createdAt))
      .limit(5)
      .all()
      .find((m) => m.aiDraftStatus !== 'DRAFT' && m.aiDraftStatus !== 'REJECTED');
    return !!last?.body && last.body.trim() === body.trim();
  }

  private settings() {
    const row = this.handle.db.select().from(aiSettings).get()!;
    const style = z.enum(['conversational', 'concise', 'structured', 'preset']).safeParse(row.responseStyle);
    const tone = z.enum(['professional', 'friendly', 'casual']).safeParse(row.tone);
    return {
      enabled: row.enabled,
      mode: row.mode,
      responseStyle: style.success ? style.data : ('conversational' as const),
      tone: tone.success ? tone.data : ('friendly' as const),
      language: row.language,
      features: parseAiFeatures(row.features),
      confidenceThreshold: row.confidenceThreshold,
      escalationTopics: row.escalationTopics,
      afterHoursMessage: row.afterHoursMessage,
    };
  }

  private turnsToday(conversationId: string) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return (
      this.handle.sqlite
        .prepare(
          `select count(*) as n from ai_activity_logs
           where conversation_id = ? and created_at >= ? and outcome != 'DROPPED'`,
        )
        .get(conversationId, start.getTime()) as { n: number }
    ).n;
  }

  private maybeSpendAlert(tokens: number | null) {
    if (!tokens) return;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const used = (
      this.handle.sqlite
        .prepare(
          `select coalesce(sum(tokens), 0) as n from ai_activity_logs where created_at >= ?`,
        )
        .get(start.getTime()) as { n: number }
    ).n;
    if (used < DAILY_TOKEN_ALERT) return;
    this.logger.warn({ used }, 'Daily Gemini token budget exceeded');
  }

  private record(row: {
    conversationId: string | null;
    messageId?: string | null;
    outcome: Outcome;
    interpretation?: string | null;
    response?: string | null;
    inputTypes: string[];
    toolCalls?: ToolCallRecord[];
    latencyMs?: number | null;
    tokens?: number | null;
  }) {
    this.handle.db
      .insert(aiActivityLogs)
      .values({
        id: newId(),
        conversationId: row.conversationId,
        messageId: row.messageId ?? null,
        inputTypes: row.inputTypes,
        interpretation: row.interpretation ?? null,
        toolCalls: row.toolCalls ?? [],
        response: row.response ?? null,
        outcome: row.outcome,
        model: this.ai.model,
        latencyMs: row.latencyMs ?? null,
        tokens: row.tokens ?? null,
      })
      .run();
  }
}

/** Order summary and payment templates from tools must appear unchanged in the reply. */
function requiredBlocks(toolCalls: ToolCallRecord[]): string[] {
  const blocks: string[] = [];
  for (const call of toolCalls) {
    if (!call.result || typeof call.result !== 'object') continue;
    const row = call.result as Record<string, unknown>;
    if (typeof row.summary === 'string' && row.summary.trim()) blocks.push(row.summary);
    if (typeof row.payment_message === 'string' && row.payment_message.trim()) {
      blocks.push(row.payment_message);
    }
  }
  return blocks;
}

function parseFinish(finish: unknown, text: string | null): Finish | null {
  const fromTool = finishSchema.safeParse(finish);
  if (fromTool.success) return fromTool.data;
  const trimmed = text?.trim();
  if (!trimmed) return null;
  return {
    reply: trimmed.slice(0, 4000),
    interpretation: '',
    confidence: 40,
    presetKey: '',
    pendingQuestion: null,
    productRefs: [],
    known: [],
  };
}
