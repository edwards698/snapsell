import { z } from 'zod';
import type { ImageDto, Paginated } from './catalog.js';
import { normalizePhone } from './phone.js';

// ---------------------------------------------------------------------------
// Public storefront
// ---------------------------------------------------------------------------

export const storeListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().max(80).optional(),
  sort: z.enum(['featured', 'price-asc', 'price-desc', 'newest']).default('featured'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(24),
});
export type StoreListQuery = z.input<typeof storeListQuerySchema>;

/** Customers see "in stock", "only N left" or "sold out" – never exact counts above the alert level. */
export type Availability =
  { state: 'in_stock' } | { state: 'low'; left: number } | { state: 'sold_out' };

export interface StoreCategory {
  id: string;
  name: string;
  slug: string;
  productCount: number;
}

export interface StoreProductCard {
  id: string;
  slug: string;
  name: string;
  image: ImageDto | null;
  priceMinMinor: number;
  priceMaxMinor: number;
  compareAtMinor: number | null;
  currency: string;
  /** False when every variant is sold out or the product is marked unavailable. */
  orderable: boolean;
  availability: Availability;
}

export interface StoreVariant {
  id: string;
  optionValues: Record<string, string>;
  label: string;
  priceMinor: number;
  compareAtMinor: number | null;
  availability: Availability;
  /** Most a customer can add (available stock, capped). */
  maxQuantity: number;
}

export interface StoreProduct {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: { name: string; slug: string } | null;
  optionNames: string[];
  currency: string;
  images: ImageDto[];
  variants: StoreVariant[];
  /** False for products the owner marked unavailable. */
  orderable: boolean;
}

export type StoreProductList = Paginated<StoreProductCard>;

export const MAX_CART_LINES = 50;
export const MAX_LINE_QUANTITY = 99;

export const cartItemSchema = z.object({
  variantId: z.string().min(1).max(40),
  quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY),
});
export const cartSchema = z.object({ items: z.array(cartItemSchema).max(MAX_CART_LINES) });
export type CartInput = z.infer<typeof cartSchema>;

export interface PricedLine {
  variantId: string;
  productName: string;
  productSlug: string;
  variantLabel: string;
  image: ImageDto | null;
  unitPriceMinor: number;
  quantity: number;
  lineTotalMinor: number;
  /** ok; reduced = fewer available than asked; unavailable = can't be ordered at all. */
  status: 'ok' | 'reduced' | 'unavailable';
  maxQuantity: number;
}

export interface PricedCart {
  lines: PricedLine[];
  currency: string;
  subtotalMinor: number;
  delivery: { enabled: boolean; feeMinor: number };
  collection: { enabled: boolean; address: string | null };
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

export const addressSchema = z.object({
  line1: z
    .string({ error: 'Enter the street or house' })
    .trim()
    .min(3, 'Enter the street or house')
    .max(120),
  area: z.string().trim().max(80).default(''),
  city: z.string().trim().max(80).default(''),
  notes: z.string().trim().max(200).default(''),
});

export const checkoutSchema = z
  .object({
    /** Generated once per checkout attempt in the browser; makes double-submits safe. */
    checkoutKey: z.string().min(16).max(64),
    items: z.array(cartItemSchema).min(1, 'Your cart is empty').max(MAX_CART_LINES),
    fullName: z
      .string({ error: 'Enter your full name' })
      .trim()
      .min(2, 'Enter your full name')
      .max(100),
    phone: z
      .string({ error: 'Enter your phone number' })
      .trim()
      .min(1, 'Enter your phone number')
      .refine((p) => normalizePhone(p) !== null, 'Enter a valid phone number, e.g. 097 123 4567'),
    fulfilment: z.enum(['DELIVERY', 'COLLECTION']),
    address: addressSchema.optional(),
    notes: z.string().trim().max(500).default(''),
    /** The total the customer saw; if prices changed since, checkout stops and shows the new total. */
    expectedTotalMinor: z.number().int().min(0),
  })
  .superRefine((c, ctx) => {
    if (c.fulfilment === 'DELIVERY' && !c.address) {
      ctx.addIssue({
        code: 'custom',
        path: ['address', 'line1'],
        message: 'Enter the street or house',
      });
    }
  });
export type CheckoutInput = z.input<typeof checkoutSchema>;

export interface CheckoutResult {
  ref: string;
  statusToken: string;
  /** Where to send the customer to pay; null if a link couldn't be created yet. */
  paymentUrl: string | null;
}

export interface PublicOrder {
  ref: string;
  status: string;
  paymentStatus: string;
  fulfilmentStatus: string;
  fulfilmentMethod: 'DELIVERY' | 'COLLECTION' | null;
  customerFirstName: string;
  lines: Array<{ name: string; variantLabel: string; quantity: number; lineTotalMinor: number }>;
  subtotalMinor: number;
  deliveryFeeMinor: number;
  totalMinor: number;
  currency: string;
  reservedUntil: string | null;
  /** Present while the order can be paid online. */
  paymentUrl: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Owner shop settings
// ---------------------------------------------------------------------------

export const shopSettingsSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter your shop name').max(60),
    address: z.string().trim().max(200).default(''),
    deliveryEnabled: z.boolean(),
    deliveryFeeMinor: z.number().int().min(0).max(100_000_00),
    collectionEnabled: z.boolean(),
    reservationTtlMinutes: z
      .number()
      .int()
      .min(10)
      .max(7 * 24 * 60),
  })
  .refine((s) => s.deliveryEnabled || s.collectionEnabled, {
    message: 'Offer delivery, collection or both',
    path: ['collectionEnabled'],
  });
export type ShopSettingsInput = z.input<typeof shopSettingsSchema>;

export interface ShopSettings {
  name: string;
  address: string;
  currency: string;
  deliveryEnabled: boolean;
  deliveryFeeMinor: number;
  collectionEnabled: boolean;
  reservationTtlMinutes: number;
}
