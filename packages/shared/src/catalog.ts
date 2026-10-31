import { z } from 'zod';

// ---------------------------------------------------------------------------
// Inputs (validated identically in the browser and the API)
// ---------------------------------------------------------------------------

/** Archiving has its own endpoint; these are the statuses an owner picks in the editor. */
export const EditableProductStatus = z.enum(['ACTIVE', 'INACTIVE', 'UNAVAILABLE']);
export type EditableProductStatus = z.infer<typeof EditableProductStatus>;

export const MAX_OPTIONS = 3;
export const MAX_VARIANTS = 100;
export const MAX_IMAGES_PER_PRODUCT = 12;

const minor = z
  .number({ error: 'Enter an amount' })
  .int('Enter a valid amount')
  .min(0, 'Can’t be negative')
  .max(100_000_000_00, 'That amount is too large');

export const categoryInputSchema = z.object({
  name: z
    .string({ error: 'Enter a name' })
    .trim()
    .min(1, 'Enter a name')
    .max(60, 'Keep it under 60 characters'),
});
export type CategoryInput = z.infer<typeof categoryInputSchema>;

export const categoryOrderSchema = z.object({ ids: z.array(z.string()).max(500) });

export const variantInputSchema = z
  .object({
    /** Present when updating an existing variant. */
    id: z.string().optional(),
    /** Generated when left empty. */
    sku: z
      .string()
      .trim()
      .max(40, 'Keep SKUs under 40 characters')
      .regex(/^[A-Za-z0-9._-]*$/, 'Use letters, numbers, dots and dashes')
      .default(''),
    optionValues: z
      .record(z.string(), z.string().trim().min(1, 'Enter a value').max(40))
      .default({}),
    priceMinor: minor,
    compareAtMinor: minor.nullable().default(null),
    /** Only used when a variant is created; later changes go through stock adjustments. */
    initialStock: z.number().int().min(0, 'Can’t be negative').max(1_000_000).default(0),
    lowStockThreshold: z.number().int().min(0).max(100_000).default(3),
  })
  .refine((v) => v.compareAtMinor === null || v.compareAtMinor > v.priceMinor, {
    message: 'Must be higher than the price',
    path: ['compareAtMinor'],
  });
export type VariantInput = z.input<typeof variantInputSchema>;

export const productInputSchema = z
  .object({
    name: z
      .string({ error: 'Enter a product name' })
      .trim()
      .min(1, 'Enter a product name')
      .max(120, 'Keep it under 120 characters'),
    description: z.string().trim().max(5000, 'Keep it under 5,000 characters').default(''),
    categoryId: z.string().nullable().default(null),
    status: EditableProductStatus.default('ACTIVE'),
    optionNames: z
      .array(z.string().trim().min(1, 'Name the option').max(30))
      .max(MAX_OPTIONS, `Up to ${MAX_OPTIONS} options`)
      .default([]),
    variants: z.array(variantInputSchema).min(1, 'Add at least one variant').max(MAX_VARIANTS),
  })
  .superRefine((p, ctx) => {
    const lower = p.optionNames.map((n) => n.toLowerCase());
    lower.forEach((n, i) => {
      if (lower.indexOf(n) !== i)
        ctx.addIssue({
          code: 'custom',
          path: ['optionNames', i],
          message: 'Option names must be different',
        });
    });
    if (p.optionNames.length === 0 && p.variants.length > 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['optionNames'],
        message: 'Add an option (like Size) to sell more than one variant',
      });
    }
    const combos = new Map<string, number>();
    const skus = new Map<string, number>();
    p.variants.forEach((v, i) => {
      const keys = Object.keys(v.optionValues);
      for (const name of p.optionNames) {
        if (!v.optionValues[name])
          ctx.addIssue({
            code: 'custom',
            path: ['variants', i, 'optionValues', name],
            message: 'Enter a value',
          });
      }
      for (const key of keys) {
        if (!p.optionNames.includes(key))
          ctx.addIssue({
            code: 'custom',
            path: ['variants', i, 'optionValues', key],
            message: 'Unknown option',
          });
      }
      const combo = p.optionNames
        .map((n) => (v.optionValues[n] ?? '').toLowerCase())
        .join('\u0000');
      if (p.optionNames.length && combos.has(combo)) {
        ctx.addIssue({
          code: 'custom',
          path: ['variants', i, 'optionValues'],
          message: 'This combination is already listed',
        });
      }
      combos.set(combo, i);
      const sku = v.sku.toUpperCase();
      if (sku && skus.has(sku))
        ctx.addIssue({
          code: 'custom',
          path: ['variants', i, 'sku'],
          message: 'SKU is already used above',
        });
      if (sku) skus.set(sku, i);
    });
  });
export type ProductInput = z.input<typeof productInputSchema>;
export type ProductInputParsed = z.output<typeof productInputSchema>;

export const ProductStatusFilter = z.enum(['all', 'ACTIVE', 'INACTIVE', 'UNAVAILABLE', 'ARCHIVED']);
export const StockFilter = z.enum(['all', 'low', 'out']);
export const ProductSort = z.enum(['updated', 'name', 'price', 'stock']);

export const productListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: ProductStatusFilter.default('all'),
  categoryId: z.string().optional(),
  stock: StockFilter.default('all'),
  sort: ProductSort.default('updated'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});
export type ProductListQuery = z.input<typeof productListQuerySchema>;

export const imageOrderSchema = z.object({ ids: z.array(z.string()).max(MAX_IMAGES_PER_PRODUCT) });
export const imageAltSchema = z.object({ alt: z.string().trim().max(200) });

/** Reasons an owner can give for a manual stock change; each maps to a stock_movements reason. */
export const AdjustmentReason = z.enum(['RECEIVED', 'RETURN', 'COUNT', 'DAMAGED', 'OTHER']);
export type AdjustmentReason = z.infer<typeof AdjustmentReason>;

export const ADJUSTMENT_REASONS: Record<
  AdjustmentReason,
  { label: string; movement: 'MANUAL_ADJUST' | 'RETURN' | 'CORRECTION' }
> = {
  RECEIVED: { label: 'New stock received', movement: 'MANUAL_ADJUST' },
  RETURN: { label: 'Customer return', movement: 'RETURN' },
  COUNT: { label: 'Stock count correction', movement: 'CORRECTION' },
  DAMAGED: { label: 'Damaged or lost', movement: 'MANUAL_ADJUST' },
  OTHER: { label: 'Other', movement: 'MANUAL_ADJUST' },
};

export const stockAdjustmentSchema = z
  .object({
    mode: z.enum(['add', 'remove', 'set']),
    quantity: z
      .number({ error: 'Enter a quantity' })
      .int('Whole numbers only')
      .min(0)
      .max(1_000_000),
    reason: AdjustmentReason,
    note: z.string().trim().max(200).default(''),
  })
  .refine((a) => a.mode === 'set' || a.quantity > 0, {
    message: 'Enter a quantity above 0',
    path: ['quantity'],
  })
  .refine((a) => a.reason !== 'OTHER' || a.note.length > 0, {
    message: 'Add a short note',
    path: ['note'],
  });
export type StockAdjustment = z.input<typeof stockAdjustmentSchema>;

export const stockSettingsSchema = z.object({
  lowStockThreshold: z.number().int().min(0).max(100_000),
});

export const stockListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  stock: StockFilter.default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export const snapInputSchema = z.object({ note: z.string().trim().max(500).default('') });

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ImageDto {
  id: string;
  alt: string;
  width: number;
  height: number;
  blurDataUrl: string | null;
  /** A mid-size WebP rendition for simple <img src>. */
  src: string;
  srcSet: { webp: string; avif: string };
}

export interface CategoryDto {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  archived: boolean;
  productCount: number;
}

export type StockState = 'ok' | 'low' | 'out';

export interface VariantDto {
  id: string;
  sku: string;
  optionValues: Record<string, string>;
  label: string;
  priceMinor: number;
  compareAtMinor: number | null;
  currency: string;
  isDefault: boolean;
  onHand: number;
  reserved: number;
  available: number;
  lowStockThreshold: number;
  state: StockState;
  hasOrders: boolean;
}

export interface ProductDetail {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: 'ACTIVE' | 'INACTIVE' | 'UNAVAILABLE' | 'ARCHIVED';
  categoryId: string | null;
  optionNames: string[];
  currency: string;
  variants: VariantDto[];
  images: ImageDto[];
  hasOrders: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductListItem {
  id: string;
  name: string;
  slug: string;
  status: ProductDetail['status'];
  category: { id: string; name: string } | null;
  image: ImageDto | null;
  priceMinMinor: number;
  priceMaxMinor: number;
  compareAtMinor: number | null;
  currency: string;
  variantCount: number;
  /** Set when the product has exactly one variant, so its stock can be edited inline. */
  singleVariantId: string | null;
  onHand: number;
  available: number;
  state: StockState;
  updatedAt: string;
}

export interface StockRow {
  variantId: string;
  productId: string;
  productName: string;
  productStatus: ProductDetail['status'];
  label: string;
  sku: string;
  onHand: number;
  reserved: number;
  available: number;
  lowStockThreshold: number;
  state: StockState;
  image: ImageDto | null;
}

export interface StockSummary {
  variants: number;
  unitsAvailable: number;
  low: number;
  out: number;
  attention: StockRow[];
}

export interface StockMovementDto {
  id: string;
  deltaOnHand: number;
  deltaReserved: number;
  reason: string;
  note: string | null;
  orderRef: string | null;
  userName: string | null;
  createdAt: string;
}

export interface SnapSuggestion {
  name: string;
  description: string;
  priceMinor: number | null;
  quantity: number | null;
  categoryId: string | null;
  /** What the assistant heard in the voice note, so the owner can check it. */
  heard: string | null;
}

export function variantLabel(optionNames: string[], values: Record<string, string>) {
  const parts = optionNames.map((n) => values[n]).filter(Boolean);
  return parts.length ? parts.join(' / ') : 'Default';
}

export function stockState(available: number, threshold: number): StockState {
  if (available <= 0) return 'out';
  return available <= threshold ? 'low' : 'ok';
}
