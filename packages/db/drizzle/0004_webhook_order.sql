ALTER TABLE `webhook_events` ADD `order_id` text REFERENCES orders(id);--> statement-breakpoint
CREATE INDEX `webhook_events_order_idx` ON `webhook_events` (`order_id`);