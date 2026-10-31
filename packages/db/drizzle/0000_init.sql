CREATE TABLE `ai_activity_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text,
	`message_id` text,
	`input_types` text DEFAULT '[]' NOT NULL,
	`interpretation` text,
	`tool_calls` text DEFAULT '[]' NOT NULL,
	`response` text,
	`outcome` text NOT NULL,
	`model` text,
	`latency_ms` integer,
	`tokens` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ai_activity_logs_outcome_check" CHECK("ai_activity_logs"."outcome" in ('SUGGESTED', 'APPROVED', 'AUTO_SENT', 'DROPPED', 'ESCALATED', 'ERROR'))
);
--> statement-breakpoint
CREATE INDEX `ai_activity_logs_conversation_idx` ON `ai_activity_logs` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `ai_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`mode` text DEFAULT 'SUGGEST' NOT NULL,
	`response_style` text DEFAULT 'conversational' NOT NULL,
	`tone` text DEFAULT 'friendly' NOT NULL,
	`language` text DEFAULT 'en' NOT NULL,
	`features` text DEFAULT '{}' NOT NULL,
	`confidence_threshold` integer DEFAULT 70 NOT NULL,
	`escalation_topics` text DEFAULT '[]' NOT NULL,
	`after_hours_message` text,
	`takeover_timeout_minutes` integer,
	`per_order_limit_minor` integer,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	CONSTRAINT "ai_settings_singleton" CHECK("ai_settings"."id" = 1),
	CONSTRAINT "ai_settings_mode_check" CHECK("ai_settings"."mode" in ('MANUAL', 'SUGGEST', 'AUTO'))
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text,
	`before` text,
	`after` text,
	`ip` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	CONSTRAINT "audit_logs_actor_check" CHECK("audit_logs"."actor" in ('OWNER', 'SYSTEM', 'AI'))
);
--> statement-breakpoint
CREATE INDEX `audit_logs_entity_idx` ON `audit_logs` (`entity`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_created_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `business_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`name` text DEFAULT 'SnapSell Shop' NOT NULL,
	`logo_file_key` text,
	`brand_color` text,
	`address` text,
	`timezone` text DEFAULT 'Africa/Lusaka' NOT NULL,
	`currency` text DEFAULT 'ZMW' NOT NULL,
	`opening_hours` text,
	`delivery_enabled` integer DEFAULT true NOT NULL,
	`delivery_fee_minor` integer DEFAULT 0 NOT NULL,
	`collection_enabled` integer DEFAULT true NOT NULL,
	`reservation_ttl_minutes` integer DEFAULT 60 NOT NULL,
	`draft_ttl_minutes` integer DEFAULT 1440 NOT NULL,
	`media_retention_days` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	CONSTRAINT "business_settings_singleton" CHECK("business_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_slug_unique` ON `categories` (`slug`);--> statement-breakpoint
CREATE TABLE `conversation_controls` (
	`conversation_id` text PRIMARY KEY NOT NULL,
	`mode` text DEFAULT 'AI_SUGGEST' NOT NULL,
	`generation` integer DEFAULT 0 NOT NULL,
	`takeover_until` integer,
	`changed_by` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "conversation_controls_mode_check" CHECK("conversation_controls"."mode" in ('AI_AUTO', 'AI_SUGGEST', 'HUMAN', 'PAUSED'))
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`channel_address` text NOT NULL,
	`last_message_at` integer,
	`unread_count` integer DEFAULT 0 NOT NULL,
	`summary` text,
	`context` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conversations_channel_address_unique` ON `conversations` (`channel_address`);--> statement-breakpoint
CREATE INDEX `conversations_last_message_idx` ON `conversations` (`last_message_at`);--> statement-breakpoint
CREATE TABLE `counters` (
	`name` text PRIMARY KEY NOT NULL,
	`value` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`full_name` text NOT NULL,
	`phone_e164` text NOT NULL,
	`whatsapp_id` text,
	`default_address` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customers_phone_unique` ON `customers` (`phone_e164`);--> statement-breakpoint
CREATE UNIQUE INDEX `customers_whatsapp_unique` ON `customers` (`whatsapp_id`);--> statement-breakpoint
CREATE TABLE `email_log` (
	`id` text PRIMARY KEY NOT NULL,
	`to` text NOT NULL,
	`template` text NOT NULL,
	`provider_id` text,
	`status` text NOT NULL,
	`error` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	CONSTRAINT "email_log_status_check" CHECK("email_log"."status" in ('SENT', 'LOGGED', 'FAILED'))
);
--> statement-breakpoint
CREATE TABLE `integrations` (
	`kind` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'NOT_CONFIGURED' NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	CONSTRAINT "integrations_kind_check" CHECK("integrations"."kind" in ('WHATSAPP', 'DEVDRAFT', 'RESEND'))
);
--> statement-breakpoint
CREATE TABLE `inventory` (
	`variant_id` text PRIMARY KEY NOT NULL,
	`on_hand` integer DEFAULT 0 NOT NULL,
	`reserved` integer DEFAULT 0 NOT NULL,
	`low_stock_threshold` integer DEFAULT 3 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "inventory_on_hand_check" CHECK("inventory"."on_hand" >= 0),
	CONSTRAINT "inventory_reserved_check" CHECK("inventory"."reserved" >= 0 and "inventory"."reserved" <= "inventory"."on_hand")
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`queue` text NOT NULL,
	`dedupe_key` text,
	`group_key` text,
	`payload` text DEFAULT '{}' NOT NULL,
	`run_at` integer NOT NULL,
	`status` text DEFAULT 'QUEUED' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 5 NOT NULL,
	`locked_until` integer,
	`last_error` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	CONSTRAINT "jobs_status_check" CHECK("jobs"."status" in ('QUEUED', 'RUNNING', 'DONE', 'FAILED', 'CANCELLED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_dedupe_unique` ON `jobs` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `jobs_ready_idx` ON `jobs` (`status`,`run_at`);--> statement-breakpoint
CREATE INDEX `jobs_group_idx` ON `jobs` (`group_key`,`status`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`provider_message_id` text,
	`direction` text NOT NULL,
	`author` text NOT NULL,
	`type` text DEFAULT 'TEXT' NOT NULL,
	`body` text,
	`media` text,
	`delivery_state` text,
	`ai_draft_status` text DEFAULT 'NONE' NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "messages_direction_check" CHECK("messages"."direction" in ('IN', 'OUT')),
	CONSTRAINT "messages_author_check" CHECK("messages"."author" in ('CUSTOMER', 'AI', 'OWNER', 'SYSTEM')),
	CONSTRAINT "messages_type_check" CHECK("messages"."type" in ('TEXT', 'IMAGE', 'AUDIO', 'DOCUMENT', 'OTHER')),
	CONSTRAINT "messages_ai_draft_check" CHECK("messages"."ai_draft_status" in ('NONE', 'DRAFT', 'APPROVED', 'REJECTED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `messages_provider_unique` ON `messages` (`provider_message_id`);--> statement-breakpoint
CREATE INDEX `messages_conversation_idx` ON `messages` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`product_name_snapshot` text NOT NULL,
	`variant_label_snapshot` text DEFAULT '' NOT NULL,
	`sku_snapshot` text NOT NULL,
	`unit_price_minor` integer NOT NULL,
	`quantity` integer NOT NULL,
	`line_total_minor` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "order_items_quantity_check" CHECK("order_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE INDEX `order_items_order_idx` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`ref` text NOT NULL,
	`channel` text NOT NULL,
	`customer_id` text NOT NULL,
	`status` text NOT NULL,
	`payment_status` text DEFAULT 'UNPAID' NOT NULL,
	`fulfilment_status` text DEFAULT 'UNFULFILLED' NOT NULL,
	`fulfilment_method` text,
	`delivery_address` text,
	`subtotal_minor` integer DEFAULT 0 NOT NULL,
	`delivery_fee_minor` integer DEFAULT 0 NOT NULL,
	`discount_minor` integer DEFAULT 0 NOT NULL,
	`total_minor` integer DEFAULT 0 NOT NULL,
	`currency` text NOT NULL,
	`reservation_expires_at` integer,
	`conversation_id` text,
	`quote_id` text,
	`status_token` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`needs_attention` integer DEFAULT false NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`quote_id`) REFERENCES `quotes`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "orders_channel_check" CHECK("orders"."channel" in ('WEBSITE', 'WHATSAPP')),
	CONSTRAINT "orders_status_check" CHECK("orders"."status" in ('DRAFT', 'PENDING_CONFIRMATION', 'PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED', 'EXPIRED', 'COMPLETED')),
	CONSTRAINT "orders_payment_status_check" CHECK("orders"."payment_status" in ('UNPAID', 'LINK_CREATED', 'PAID', 'FAILED', 'REFUNDED')),
	CONSTRAINT "orders_fulfilment_status_check" CHECK("orders"."fulfilment_status" in ('UNFULFILLED', 'PROCESSING', 'READY_FOR_COLLECTION', 'DISPATCHED', 'DELIVERED')),
	CONSTRAINT "orders_fulfilment_method_check" CHECK("orders"."fulfilment_method" is null or "orders"."fulfilment_method" in ('DELIVERY', 'COLLECTION')),
	CONSTRAINT "orders_amounts_check" CHECK("orders"."subtotal_minor" >= 0 and "orders"."delivery_fee_minor" >= 0 and "orders"."discount_minor" >= 0 and "orders"."total_minor" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_ref_unique` ON `orders` (`ref`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_idempotency_unique` ON `orders` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `orders_customer_idx` ON `orders` (`customer_id`);--> statement-breakpoint
CREATE INDEX `orders_status_idx` ON `orders` (`status`);--> statement-breakpoint
CREATE INDEX `orders_created_idx` ON `orders` (`created_at`);--> statement-breakpoint
CREATE INDEX `orders_reservation_idx` ON `orders` (`reservation_expires_at`);--> statement-breakpoint
CREATE TABLE `password_reset_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `password_reset_tokens_user_idx` ON `password_reset_tokens` (`user_id`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_link_id` text,
	`provider_payment_id` text,
	`payment_url` text,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`status` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`raw_response` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "payments_provider_check" CHECK("payments"."provider" in ('DEVDRAFT')),
	CONSTRAINT "payments_status_check" CHECK("payments"."status" in ('CREATING', 'LINK_CREATED', 'PAID', 'FAILED', 'EXPIRED'))
);
--> statement-breakpoint
CREATE INDEX `payments_order_idx` ON `payments` (`order_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `payments_link_unique` ON `payments` (`provider_link_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `payments_payment_unique` ON `payments` (`provider_payment_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `payments_idempotency_unique` ON `payments` (`idempotency_key`);--> statement-breakpoint
CREATE TABLE `preset_responses` (
	`key` text PRIMARY KEY NOT NULL,
	`text` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `product_images` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`file_key` text NOT NULL,
	`alt` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`width` integer,
	`height` integer,
	`blur_data_url` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `product_images_product_idx` ON `product_images` (`product_id`);--> statement-breakpoint
CREATE TABLE `product_variants` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`sku` text NOT NULL,
	`option_values` text DEFAULT '{}' NOT NULL,
	`price_minor` integer NOT NULL,
	`compare_at_minor` integer,
	`currency` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "product_variants_price_check" CHECK("product_variants"."price_minor" >= 0),
	CONSTRAINT "product_variants_compare_at_check" CHECK("product_variants"."compare_at_minor" is null or "product_variants"."compare_at_minor" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_variants_sku_unique` ON `product_variants` (`sku`);--> statement-breakpoint
CREATE INDEX `product_variants_product_idx` ON `product_variants` (`product_id`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`category_id` text,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "products_status_check" CHECK("products"."status" in ('ACTIVE', 'INACTIVE', 'UNAVAILABLE', 'ARCHIVED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_slug_unique` ON `products` (`slug`);--> statement-breakpoint
CREATE INDEX `products_category_idx` ON `products` (`category_id`);--> statement-breakpoint
CREATE INDEX `products_status_idx` ON `products` (`status`);--> statement-breakpoint
CREATE TABLE `quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text,
	`items` text NOT NULL,
	`fees` text DEFAULT '{}' NOT NULL,
	`total_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`hash` text NOT NULL,
	`presented_message_id` text,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`key`, `window_start`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`csrf_token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`idle_expires_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`ip` text,
	`user_agent` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `stock_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`variant_id` text NOT NULL,
	`delta_on_hand` integer DEFAULT 0 NOT NULL,
	`delta_reserved` integer DEFAULT 0 NOT NULL,
	`reason` text NOT NULL,
	`note` text,
	`order_id` text,
	`user_id` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "stock_movements_reason_check" CHECK("stock_movements"."reason" in ('MANUAL_ADJUST', 'RESERVE', 'RELEASE', 'SALE', 'RETURN', 'CORRECTION'))
);
--> statement-breakpoint
CREATE INDEX `stock_movements_variant_idx` ON `stock_movements` (`variant_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `stock_movements_order_unique` ON `stock_movements` (`order_id`,`variant_id`,`reason`) WHERE "stock_movements"."order_id" is not null;--> statement-breakpoint
CREATE TABLE `system_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'OWNER' NOT NULL,
	`failed_logins` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	`password_changed_at` integer,
	`last_login_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	CONSTRAINT "users_role_check" CHECK("users"."role" in ('OWNER'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `webhook_events` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`provider_event_id` text NOT NULL,
	`type` text NOT NULL,
	`signature_valid` integer NOT NULL,
	`payload` text,
	`status` text DEFAULT 'RECEIVED' NOT NULL,
	`outcome` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	CONSTRAINT "webhook_events_status_check" CHECK("webhook_events"."status" in ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `webhook_events_provider_event_unique` ON `webhook_events` (`provider`,`provider_event_id`);