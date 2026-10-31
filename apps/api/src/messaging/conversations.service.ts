import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  conversationControls,
  conversations,
  customers,
  type DatabaseHandle,
  messages,
  orders,
  presetResponses,
} from '@snapsell/db';
import {
  type ConversationDetail,
  type ConversationListItem,
  type ConversationListQuery,
  conversationListQuerySchema,
  type ConversationMode,
  formatPhone,
  type MessageDto,
  type Paginated,
  type PresetDto,
} from '@snapsell/shared';
import { and, asc, desc, eq, lt, ne } from 'drizzle-orm';
import { ApiError } from '../common/errors.js';
import { EventBus } from '../common/events.js';
import { DATABASE } from '../database/database.module.js';
import { FileStore } from '../files/file-store.js';
import { ensureControl } from './conversation-control.service.js';
import { toMessageDto } from './message-dto.js';

const MESSAGE_PAGE = 100;

interface ListRow {
  id: string;
  customer_id: string;
  full_name: string;
  phone_e164: string;
  last_message_at: number | null;
  unread_count: number;
  mode: ConversationMode | null;
  takeover_until: number | null;
  last_body: string | null;
  last_type: MessageDto['type'];
  last_direction: 'IN' | 'OUT' | null;
}

/** Inbox queries for the admin (BUILD_PLAN §2.5). */
@Injectable()
export class ConversationsService {
  constructor(
    @Inject(DATABASE) private readonly handle: DatabaseHandle,
    private readonly files: FileStore,
    private readonly events: EventBus,
  ) {}

  list(query: ConversationListQuery): Paginated<ConversationListItem> {
    const q = conversationListQuerySchema.parse(query);
    const where: string[] = [];
    const params: Record<string, unknown> = {};
    if (q.filter === 'unread') where.push('c.unread_count > 0');
    if (q.filter === 'human') where.push(`cc.mode = 'HUMAN'`);
    if (q.q) {
      where.push(`(cu.full_name like @like or cu.phone_e164 like @phoneLike
        or exists (select 1 from messages sm where sm.conversation_id = c.id and sm.body like @like))`);
      params.like = `%${q.q}%`;
      params.phoneLike = `%${q.q.replace(/[^\d+]/g, '') || q.q}%`;
    }
    const whereSql = where.length ? `where ${where.join(' and ')}` : '';
    const from = `from conversations c
      join customers cu on cu.id = c.customer_id
      left join conversation_controls cc on cc.conversation_id = c.id`;
    const { sqlite } = this.handle;
    const total = (
      sqlite.prepare(`select count(*) as n ${from} ${whereSql}`).get(params) as { n: number }
    ).n;
    const rows = sqlite
      .prepare(
        `select c.id, c.customer_id, cu.full_name, cu.phone_e164, c.last_message_at, c.unread_count,
                cc.mode, cc.takeover_until,
                lm.body as last_body, lm.type as last_type, lm.direction as last_direction
         ${from}
         left join messages lm on lm.id = (
           select m.id from messages m where m.conversation_id = c.id
           order by m.created_at desc limit 1)
         ${whereSql}
         order by coalesce(c.last_message_at, c.created_at) desc
         limit @limit offset @offset`,
      )
      .all({ ...params, limit: q.pageSize, offset: (q.page - 1) * q.pageSize }) as ListRow[];
    return {
      items: rows.map((r) => ({
        id: r.id,
        customer: { id: r.customer_id, name: r.full_name, phone: formatPhone(r.phone_e164) },
        lastMessage: r.last_direction
          ? { body: r.last_body, type: r.last_type, direction: r.last_direction }
          : null,
        lastMessageAt: r.last_message_at ? new Date(r.last_message_at).toISOString() : null,
        unreadCount: r.unread_count,
        mode: r.mode ?? 'AI_SUGGEST',
        takeoverUntil: r.takeover_until ? new Date(r.takeover_until).toISOString() : null,
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  unreadTotal() {
    const row = this.handle.sqlite
      .prepare(
        `select count(*) as conversations, coalesce(sum(unread_count), 0) as messages
         from conversations where unread_count > 0`,
      )
      .get() as { conversations: number; messages: number };
    return row;
  }

  get(id: string): ConversationDetail {
    const { db } = this.handle;
    const row = db
      .select({ conversation: conversations, customer: customers })
      .from(conversations)
      .innerJoin(customers, eq(customers.id, conversations.customerId))
      .where(eq(conversations.id, id))
      .get();
    if (!row) throw new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Conversation not found.');
    ensureControl(db, id);
    const control = db
      .select()
      .from(conversationControls)
      .where(eq(conversationControls.conversationId, id))
      .get()!;
    const page = this.messages(id);
    const last = page.messages.at(-1) ?? null;
    const customerOrders = db
      .select()
      .from(orders)
      .where(and(eq(orders.customerId, row.customer.id), ne(orders.status, 'DRAFT')))
      .orderBy(desc(orders.createdAt))
      .limit(10)
      .all();
    return {
      id,
      customer: {
        id: row.customer.id,
        name: row.customer.fullName,
        phone: formatPhone(row.customer.phoneE164),
      },
      lastMessage: last ? { body: last.body, type: last.type, direction: last.direction } : null,
      lastMessageAt: row.conversation.lastMessageAt?.toISOString() ?? null,
      unreadCount: row.conversation.unreadCount,
      mode: control.mode,
      takeoverUntil: control.takeoverUntil?.toISOString() ?? null,
      generation: control.generation,
      messages: page.messages,
      hasMore: page.hasMore,
      orders: customerOrders.map((o) => ({
        ref: o.ref,
        totalMinor: o.totalMinor,
        currency: o.currency,
        status: o.status,
        paymentStatus: o.paymentStatus,
        fulfilmentStatus: o.fulfilmentStatus,
        createdAt: o.createdAt.toISOString(),
      })),
    };
  }

  /** Newest page of messages (oldest first), or the page before `before`. */
  messages(conversationId: string, before?: Date) {
    const rows = this.handle.db
      .select()
      .from(messages)
      .where(
        before
          ? and(eq(messages.conversationId, conversationId), lt(messages.createdAt, before))
          : eq(messages.conversationId, conversationId),
      )
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(MESSAGE_PAGE + 1)
      .all();
    const hasMore = rows.length > MESSAGE_PAGE;
    return {
      messages: rows
        .slice(0, MESSAGE_PAGE)
        .reverse()
        .map((m) => toMessageDto(m, this.files)),
      hasMore,
    };
  }

  markRead(id: string) {
    const res = this.handle.db
      .update(conversations)
      .set({ unreadCount: 0 })
      .where(and(eq(conversations.id, id), ne(conversations.unreadCount, 0)))
      .run();
    if (res.changes) this.events.emit('conversation.updated', { conversationId: id });
    return { ok: true };
  }

  presets(): PresetDto[] {
    return this.handle.db
      .select({ key: presetResponses.key, text: presetResponses.text })
      .from(presetResponses)
      .where(eq(presetResponses.enabled, true))
      .orderBy(asc(presetResponses.key))
      .all();
  }
}
