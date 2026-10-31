import { sql, type SQL } from 'drizzle-orm';
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import {
  AiDraftStatus,
  AiGlobalMode,
  AiOutcome,
  AuditActor,
  ConversationMode,
  EmailStatus,
  FulfilmentMethod,
  FulfilmentStatus,
  IntegrationKind,
  JobStatus,
  MessageAuthor,
  MessageDirection,
  MessageType,
  OrderStatus,
  PaymentProviderName,
  PaymentRecordStatus,
  PaymentStatus,
  ProductStatus,
  SalesChannel,
  StockMovementReason,
  UserRole,
  WebhookEventStatus,
} from '@snapsell/shared';

// Conventions (BUILD_PLAN D2, D14, D15):
// - money is INTEGER minor units, always paired with a currency column
// - timestamps are INTEGER milliseconds since the epoch (UTC)
// - enums are TEXT with a CHECK constraint generated from the shared zod enum
// - JSON is TEXT

type EnumLike = { options: readonly string[] };

function oneOf(column: AnySQLiteColumn, values: EnumLike): SQL {
  const list = values.options.map((v) => `'${v}'`).join(', ');
  return sql`${column} in (${sql.raw(list)})`;
}

function enumText<T extends string>(name: string, values: { options: readonly T[] }) {
  return text(name, { enum: values.options as [T, ...T[]] });
}

const timestamp = (name: string) => integer(name, { mode: 'timestamp_ms' });
const createdAt = () =>
  timestamp('created_at')
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`);
const updatedAt = () =>
  timestamp('updated_at')
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`)
    .$onUpdate(() => new Date());
const json = <T>(name: string) => text(name, { mode: 'json' }).$type<T>();
const bool = (name: string) => integer(name, { mode: 'boolean' });

// ---------------------------------------------------------------------------
// Admin users and sessions
// ---------------------------------------------------------------------------

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: enumText('role', UserRole).notNull().default('OWNER'),
    failedLogins: integer('failed_logins').notNull().default(0),
    lockedUntil: timestamp('locked_until'),
    passwordChangedAt: timestamp('password_changed_at'),
    lastLoginAt: timestamp('last_login_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('users_email_unique').on(t.email),
    check('users_role_check', oneOf(t.role, UserRole)),
  ],
);

export const sessions = sqliteTable(
  'sessions',
  {
    /** SHA-256 of the session token; the raw token only ever lives in the cookie. */
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    csrfToken: text('csrf_token').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    idleExpiresAt: timestamp('idle_expires_at').notNull(),
    lastSeenAt: timestamp('last_seen_at').notNull(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const passwordResetTokens = sqliteTable(
  'password_reset_tokens',
  {
    tokenHash: text('token_hash').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at').notNull(),
    usedAt: timestamp('used_at'),
    createdAt: createdAt(),
  },
  (t) => [index('password_reset_tokens_user_idx').on(t.userId)],
);

export const rateLimits = sqliteTable(
  'rate_limits',
  {
    key: text('key').notNull(),
    windowStart: integer('window_start').notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

// ---------------------------------------------------------------------------
// Catalogue and inventory
// ---------------------------------------------------------------------------

export const categories = sqliteTable(
  'categories',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    archivedAt: timestamp('archived_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('categories_slug_unique').on(t.slug)],
);

export const products = sqliteTable(
  'products',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description').notNull().default(''),
    categoryId: text('category_id').references(() => categories.id, { onDelete: 'set null' }),
    status: enumText('status', ProductStatus).notNull().default('ACTIVE'),
    /** Option names such as ["Size", "Colour"]; each variant has a value for every option. */
    optionNames: json<string[]>('option_names').notNull().default([]),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('products_slug_unique').on(t.slug),
    index('products_category_idx').on(t.categoryId),
    index('products_status_idx').on(t.status),
    check('products_status_check', oneOf(t.status, ProductStatus)),
  ],
);

export const productVariants = sqliteTable(
  'product_variants',
  {
    id: text('id').primaryKey(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    sku: text('sku').notNull(),
    optionValues: json<Record<string, string>>('option_values').notNull().default({}),
    priceMinor: integer('price_minor').notNull(),
    compareAtMinor: integer('compare_at_minor'),
    currency: text('currency').notNull(),
    isDefault: bool('is_default').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('product_variants_sku_unique').on(t.sku),
    index('product_variants_product_idx').on(t.productId),
    check('product_variants_price_check', sql`${t.priceMinor} >= 0`),
    check(
      'product_variants_compare_at_check',
      sql`${t.compareAtMinor} is null or ${t.compareAtMinor} >= 0`,
    ),
  ],
);

export const productImages = sqliteTable(
  'product_images',
  {
    id: text('id').primaryKey(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    /** Key stem; renditions are stored as `<stem>-<width>.<webp|avif>` (see ProductImageService). */
    fileKey: text('file_key').notNull(),
    /** Widths that were generated, smallest first. */
    widths: json<number[]>('widths').notNull().default([]),
    alt: text('alt').notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(0),
    width: integer('width'),
    height: integer('height'),
    blurDataUrl: text('blur_data_url'),
    createdAt: createdAt(),
  },
  (t) => [index('product_images_product_idx').on(t.productId)],
);

export const inventory = sqliteTable(
  'inventory',
  {
    variantId: text('variant_id')
      .primaryKey()
      .references(() => productVariants.id, { onDelete: 'cascade' }),
    onHand: integer('on_hand').notNull().default(0),
    reserved: integer('reserved').notNull().default(0),
    lowStockThreshold: integer('low_stock_threshold').notNull().default(3),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('inventory_on_hand_check', sql`${t.onHand} >= 0`),
    check('inventory_reserved_check', sql`${t.reserved} >= 0 and ${t.reserved} <= ${t.onHand}`),
  ],
);

// ---------------------------------------------------------------------------
// Customers and orders
// ---------------------------------------------------------------------------

export interface Address {
  line1: string;
  line2?: string;
  area?: string;
  city?: string;
  notes?: string;
}

export const customers = sqliteTable(
  'customers',
  {
    id: text('id').primaryKey(),
    fullName: text('full_name').notNull(),
    phoneE164: text('phone_e164').notNull(),
    whatsappId: text('whatsapp_id'),
    defaultAddress: json<Address>('default_address'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('customers_phone_unique').on(t.phoneE164),
    uniqueIndex('customers_whatsapp_unique').on(t.whatsappId),
  ],
);

export const conversations = sqliteTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    channelAddress: text('channel_address').notNull(),
    lastMessageAt: timestamp('last_message_at'),
    unreadCount: integer('unread_count').notNull().default(0),
    summary: text('summary'),
    context: json<Record<string, unknown>>('context').notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('conversations_channel_address_unique').on(t.channelAddress),
    index('conversations_last_message_idx').on(t.lastMessageAt),
  ],
);

export interface QuoteItem {
  variantId: string;
  name: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
}

export const quotes = sqliteTable('quotes', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').references(() => conversations.id),
  items: json<QuoteItem[]>('items').notNull(),
  fees: json<Record<string, number>>('fees').notNull().default({}),
  totalMinor: integer('total_minor').notNull(),
  currency: text('currency').notNull(),
  hash: text('hash').notNull(),
  presentedMessageId: text('presented_message_id'),
  expiresAt: timestamp('expires_at').notNull(),
  consumedAt: timestamp('consumed_at'),
  createdAt: createdAt(),
});

export const orders = sqliteTable(
  'orders',
  {
    id: text('id').primaryKey(),
    ref: text('ref').notNull(),
    channel: enumText('channel', SalesChannel).notNull(),
    customerId: text('customer_id')
      .notNull()
      .references(() => customers.id),
    status: enumText('status', OrderStatus).notNull(),
    paymentStatus: enumText('payment_status', PaymentStatus).notNull().default('UNPAID'),
    fulfilmentStatus: enumText('fulfilment_status', FulfilmentStatus)
      .notNull()
      .default('UNFULFILLED'),
    fulfilmentMethod: enumText('fulfilment_method', FulfilmentMethod),
    deliveryAddress: json<Address>('delivery_address'),
    subtotalMinor: integer('subtotal_minor').notNull().default(0),
    deliveryFeeMinor: integer('delivery_fee_minor').notNull().default(0),
    discountMinor: integer('discount_minor').notNull().default(0),
    totalMinor: integer('total_minor').notNull().default(0),
    currency: text('currency').notNull(),
    reservationExpiresAt: timestamp('reservation_expires_at'),
    conversationId: text('conversation_id').references(() => conversations.id),
    quoteId: text('quote_id').references(() => quotes.id),
    statusToken: text('status_token').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    needsAttention: bool('needs_attention').notNull().default(false),
    notes: text('notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('orders_ref_unique').on(t.ref),
    uniqueIndex('orders_idempotency_unique').on(t.idempotencyKey),
    index('orders_customer_idx').on(t.customerId),
    index('orders_status_idx').on(t.status),
    index('orders_created_idx').on(t.createdAt),
    index('orders_reservation_idx').on(t.reservationExpiresAt),
    check('orders_channel_check', oneOf(t.channel, SalesChannel)),
    check('orders_status_check', oneOf(t.status, OrderStatus)),
    check('orders_payment_status_check', oneOf(t.paymentStatus, PaymentStatus)),
    check('orders_fulfilment_status_check', oneOf(t.fulfilmentStatus, FulfilmentStatus)),
    check(
      'orders_fulfilment_method_check',
      sql`${t.fulfilmentMethod} is null or ${oneOf(t.fulfilmentMethod, FulfilmentMethod)}`,
    ),
    check(
      'orders_amounts_check',
      sql`${t.subtotalMinor} >= 0 and ${t.deliveryFeeMinor} >= 0 and ${t.discountMinor} >= 0 and ${t.totalMinor} >= 0`,
    ),
  ],
);

export const orderItems = sqliteTable(
  'order_items',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    variantId: text('variant_id')
      .notNull()
      .references(() => productVariants.id),
    productNameSnapshot: text('product_name_snapshot').notNull(),
    variantLabelSnapshot: text('variant_label_snapshot').notNull().default(''),
    skuSnapshot: text('sku_snapshot').notNull(),
    unitPriceMinor: integer('unit_price_minor').notNull(),
    quantity: integer('quantity').notNull(),
    lineTotalMinor: integer('line_total_minor').notNull(),
  },
  (t) => [
    index('order_items_order_idx').on(t.orderId),
    check('order_items_quantity_check', sql`${t.quantity} > 0`),
  ],
);

export const stockMovements = sqliteTable(
  'stock_movements',
  {
    id: text('id').primaryKey(),
    variantId: text('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'cascade' }),
    deltaOnHand: integer('delta_on_hand').notNull().default(0),
    deltaReserved: integer('delta_reserved').notNull().default(0),
    reason: enumText('reason', StockMovementReason).notNull(),
    note: text('note'),
    orderId: text('order_id').references(() => orders.id),
    userId: text('user_id').references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    index('stock_movements_variant_idx').on(t.variantId, t.createdAt),
    // Makes reserve/release/sale idempotent per order and variant (BUILD_PLAN Phase 2).
    uniqueIndex('stock_movements_order_unique')
      .on(t.orderId, t.variantId, t.reason)
      .where(sql`${t.orderId} is not null`),
    check('stock_movements_reason_check', oneOf(t.reason, StockMovementReason)),
  ],
);

// ---------------------------------------------------------------------------
// Payments and webhooks
// ---------------------------------------------------------------------------

export const payments = sqliteTable(
  'payments',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id),
    provider: enumText('provider', PaymentProviderName).notNull(),
    providerLinkId: text('provider_link_id'),
    providerPaymentId: text('provider_payment_id'),
    paymentUrl: text('payment_url'),
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency').notNull(),
    status: enumText('status', PaymentRecordStatus).notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    rawResponse: json<unknown>('raw_response'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('payments_order_idx').on(t.orderId),
    uniqueIndex('payments_link_unique').on(t.providerLinkId),
    uniqueIndex('payments_payment_unique').on(t.providerPaymentId),
    uniqueIndex('payments_idempotency_unique').on(t.idempotencyKey),
    check('payments_provider_check', oneOf(t.provider, PaymentProviderName)),
    check('payments_status_check', oneOf(t.status, PaymentRecordStatus)),
  ],
);

export const webhookEvents = sqliteTable(
  'webhook_events',
  {
    id: text('id').primaryKey(),
    provider: text('provider').notNull(),
    providerEventId: text('provider_event_id').notNull(),
    type: text('type').notNull(),
    signatureValid: bool('signature_valid').notNull(),
    payload: json<unknown>('payload'),
    status: enumText('status', WebhookEventStatus).notNull().default('RECEIVED'),
    outcome: text('outcome'),
    attempts: integer('attempts').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('webhook_events_provider_event_unique').on(t.provider, t.providerEventId),
    check('webhook_events_status_check', oneOf(t.status, WebhookEventStatus)),
  ],
);

// ---------------------------------------------------------------------------
// WhatsApp conversations and messages
// ---------------------------------------------------------------------------

export interface MessageMedia {
  mime: string;
  size: number;
  fileKey: string | null;
  expiresAt: number | null;
}

export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    providerMessageId: text('provider_message_id'),
    direction: enumText('direction', MessageDirection).notNull(),
    author: enumText('author', MessageAuthor).notNull(),
    type: enumText('type', MessageType).notNull().default('TEXT'),
    body: text('body'),
    media: json<MessageMedia>('media'),
    deliveryState: text('delivery_state'),
    aiDraftStatus: enumText('ai_draft_status', AiDraftStatus).notNull().default('NONE'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('messages_provider_unique').on(t.providerMessageId),
    index('messages_conversation_idx').on(t.conversationId, t.createdAt),
    check('messages_direction_check', oneOf(t.direction, MessageDirection)),
    check('messages_author_check', oneOf(t.author, MessageAuthor)),
    check('messages_type_check', oneOf(t.type, MessageType)),
    check('messages_ai_draft_check', oneOf(t.aiDraftStatus, AiDraftStatus)),
  ],
);

export const conversationControls = sqliteTable(
  'conversation_controls',
  {
    conversationId: text('conversation_id')
      .primaryKey()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    mode: enumText('mode', ConversationMode).notNull().default('AI_SUGGEST'),
    /** Incremented on every mode change so in-flight AI work can detect a takeover (BUILD_PLAN D8). */
    generation: integer('generation').notNull().default(0),
    /** NULL with mode HUMAN means an indefinite takeover. */
    takeoverUntil: timestamp('takeover_until'),
    changedBy: text('changed_by'),
    changedAt: createdAt(),
  },
  (t) => [check('conversation_controls_mode_check', oneOf(t.mode, ConversationMode))],
);

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const aiSettings = sqliteTable(
  'ai_settings',
  {
    id: integer('id').primaryKey().default(1),
    enabled: bool('enabled').notNull().default(false),
    mode: enumText('mode', AiGlobalMode).notNull().default('SUGGEST'),
    responseStyle: text('response_style').notNull().default('conversational'),
    tone: text('tone').notNull().default('friendly'),
    language: text('language').notNull().default('en'),
    features: json<Record<string, boolean>>('features').notNull().default({}),
    confidenceThreshold: integer('confidence_threshold').notNull().default(70),
    escalationTopics: json<string[]>('escalation_topics').notNull().default([]),
    afterHoursMessage: text('after_hours_message'),
    takeoverTimeoutMinutes: integer('takeover_timeout_minutes'),
    perOrderLimitMinor: integer('per_order_limit_minor'),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('ai_settings_singleton', sql`${t.id} = 1`),
    check('ai_settings_mode_check', oneOf(t.mode, AiGlobalMode)),
  ],
);

export const presetResponses = sqliteTable('preset_responses', {
  key: text('key').primaryKey(),
  text: text('text').notNull(),
  enabled: bool('enabled').notNull().default(true),
  updatedAt: updatedAt(),
});

export interface OpeningHours {
  /** 0 = Sunday … 6 = Saturday; times are "HH:MM" in the business timezone. */
  days: Array<{ day: number; open: string; close: string } | { day: number; closed: true }>;
}

export const businessSettings = sqliteTable(
  'business_settings',
  {
    id: integer('id').primaryKey().default(1),
    name: text('name').notNull().default('SnapSell Shop'),
    logoFileKey: text('logo_file_key'),
    brandColor: text('brand_color'),
    address: text('address'),
    timezone: text('timezone').notNull().default('Africa/Lusaka'),
    currency: text('currency').notNull().default('ZMW'),
    openingHours: json<OpeningHours>('opening_hours'),
    deliveryEnabled: bool('delivery_enabled').notNull().default(true),
    deliveryFeeMinor: integer('delivery_fee_minor').notNull().default(0),
    collectionEnabled: bool('collection_enabled').notNull().default(true),
    reservationTtlMinutes: integer('reservation_ttl_minutes').notNull().default(60),
    draftTtlMinutes: integer('draft_ttl_minutes').notNull().default(1440),
    mediaRetentionDays: integer('media_retention_days').notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [check('business_settings_singleton', sql`${t.id} = 1`)],
);

// ---------------------------------------------------------------------------
// Logs, integrations and system
// ---------------------------------------------------------------------------

export const aiActivityLogs = sqliteTable(
  'ai_activity_logs',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id').references(() => conversations.id, {
      onDelete: 'cascade',
    }),
    messageId: text('message_id').references(() => messages.id, { onDelete: 'set null' }),
    inputTypes: json<string[]>('input_types').notNull().default([]),
    interpretation: text('interpretation'),
    toolCalls: json<unknown[]>('tool_calls').notNull().default([]),
    response: text('response'),
    outcome: enumText('outcome', AiOutcome).notNull(),
    model: text('model'),
    latencyMs: integer('latency_ms'),
    tokens: integer('tokens'),
    createdAt: createdAt(),
  },
  (t) => [
    index('ai_activity_logs_conversation_idx').on(t.conversationId, t.createdAt),
    check('ai_activity_logs_outcome_check', oneOf(t.outcome, AiOutcome)),
  ],
);

export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    actor: enumText('actor', AuditActor).notNull(),
    actorId: text('actor_id'),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id'),
    before: json<unknown>('before'),
    after: json<unknown>('after'),
    ip: text('ip'),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_logs_entity_idx').on(t.entity, t.entityId),
    index('audit_logs_created_idx').on(t.createdAt),
    check('audit_logs_actor_check', oneOf(t.actor, AuditActor)),
  ],
);

export const integrations = sqliteTable(
  'integrations',
  {
    kind: enumText('kind', IntegrationKind).primaryKey(),
    status: text('status').notNull().default('NOT_CONFIGURED'),
    /** Non-secret metadata only (connected number, last error). Never credentials. */
    metadata: json<Record<string, unknown>>('metadata').notNull().default({}),
    updatedAt: updatedAt(),
  },
  (t) => [check('integrations_kind_check', oneOf(t.kind, IntegrationKind))],
);

export const jobs = sqliteTable(
  'jobs',
  {
    id: text('id').primaryKey(),
    queue: text('queue').notNull(),
    dedupeKey: text('dedupe_key'),
    groupKey: text('group_key'),
    payload: json<unknown>('payload').notNull().default({}),
    runAt: integer('run_at').notNull(),
    status: enumText('status', JobStatus).notNull().default('QUEUED'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    lockedUntil: integer('locked_until'),
    lastError: text('last_error'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('jobs_dedupe_unique').on(t.dedupeKey),
    index('jobs_ready_idx').on(t.status, t.runAt),
    index('jobs_group_idx').on(t.groupKey, t.status),
    check('jobs_status_check', oneOf(t.status, JobStatus)),
  ],
);

export const emailLog = sqliteTable(
  'email_log',
  {
    id: text('id').primaryKey(),
    to: text('to').notNull(),
    template: text('template').notNull(),
    providerId: text('provider_id'),
    status: enumText('status', EmailStatus).notNull(),
    error: text('error'),
    createdAt: createdAt(),
  },
  (t) => [check('email_log_status_check', oneOf(t.status, EmailStatus))],
);

/** Named counters, e.g. the `order_ref` sequence behind ORD-00001. */
export const counters = sqliteTable('counters', {
  name: text('name').primaryKey(),
  value: integer('value').notNull().default(0),
});

/** Small key/value store for system facts such as the last backup time. */
export const systemState = sqliteTable('system_state', {
  key: text('key').primaryKey(),
  value: json<unknown>('value'),
  updatedAt: updatedAt(),
});
