-- Product search index (BUILD_PLAN D15). One row per product, rebuilt by triggers whenever the
-- product, its variants (SKUs) or its category name change.
CREATE VIRTUAL TABLE `products_fts` USING fts5(
	product_id UNINDEXED,
	name,
	description,
	skus,
	category,
	tokenize = 'unicode61 remove_diacritics 2',
	prefix = '2 3'
);
--> statement-breakpoint
CREATE TRIGGER `products_fts_ai` AFTER INSERT ON `products` BEGIN
	INSERT INTO products_fts (product_id, name, description, skus, category)
	SELECT p.id, p.name, p.description,
		(SELECT coalesce(group_concat(v.sku, ' '), '') FROM product_variants v WHERE v.product_id = p.id),
		(SELECT coalesce(c.name, '') FROM categories c WHERE c.id = p.category_id)
	FROM products p WHERE p.id = new.id;
END;
--> statement-breakpoint
CREATE TRIGGER `products_fts_au` AFTER UPDATE ON `products` BEGIN
	DELETE FROM products_fts WHERE product_id = old.id;
	INSERT INTO products_fts (product_id, name, description, skus, category)
	SELECT p.id, p.name, p.description,
		(SELECT coalesce(group_concat(v.sku, ' '), '') FROM product_variants v WHERE v.product_id = p.id),
		(SELECT coalesce(c.name, '') FROM categories c WHERE c.id = p.category_id)
	FROM products p WHERE p.id = new.id;
END;
--> statement-breakpoint
CREATE TRIGGER `products_fts_ad` AFTER DELETE ON `products` BEGIN
	DELETE FROM products_fts WHERE product_id = old.id;
END;
--> statement-breakpoint
CREATE TRIGGER `product_variants_fts_ai` AFTER INSERT ON `product_variants` BEGIN
	UPDATE products_fts
	SET skus = (SELECT coalesce(group_concat(v.sku, ' '), '') FROM product_variants v WHERE v.product_id = new.product_id)
	WHERE product_id = new.product_id;
END;
--> statement-breakpoint
CREATE TRIGGER `product_variants_fts_au` AFTER UPDATE OF sku, product_id ON `product_variants` BEGIN
	UPDATE products_fts
	SET skus = (SELECT coalesce(group_concat(v.sku, ' '), '') FROM product_variants v WHERE v.product_id = old.product_id)
	WHERE product_id = old.product_id;
	UPDATE products_fts
	SET skus = (SELECT coalesce(group_concat(v.sku, ' '), '') FROM product_variants v WHERE v.product_id = new.product_id)
	WHERE product_id = new.product_id;
END;
--> statement-breakpoint
CREATE TRIGGER `product_variants_fts_ad` AFTER DELETE ON `product_variants` BEGIN
	UPDATE products_fts
	SET skus = (SELECT coalesce(group_concat(v.sku, ' '), '') FROM product_variants v WHERE v.product_id = old.product_id)
	WHERE product_id = old.product_id;
END;
--> statement-breakpoint
CREATE TRIGGER `categories_fts_au` AFTER UPDATE OF name ON `categories` BEGIN
	UPDATE products_fts SET category = new.name
	WHERE product_id IN (SELECT id FROM products WHERE category_id = new.id);
END;
--> statement-breakpoint
-- Seed the singleton settings rows so the app can always read them.
INSERT INTO `business_settings` (`id`) VALUES (1);
--> statement-breakpoint
INSERT INTO `ai_settings` (`id`) VALUES (1);
--> statement-breakpoint
INSERT INTO `integrations` (`kind`) VALUES ('WHATSAPP'), ('DEVDRAFT'), ('RESEND');
