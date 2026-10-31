import type { DatabaseHandle } from '@snapsell/db';
import { formatMoney, type PresetKey, variantLabel } from '@snapsell/shared';
import { z } from 'zod';
import { ftsQuery } from '../catalog/products.service.js';
import type { ToolDeclaration } from './ai.provider.js';

export interface OrderToolOps {
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
  }) => unknown;
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
  }) => unknown;
  calculate: (draftId: string) => unknown;
  confirm: (quoteId: string) => unknown;
  generatePaymentLink: (orderRef: string) => Promise<unknown> | unknown;
}

export interface ToolContext {
  sqlite: DatabaseHandle['sqlite'];
  /** Null in the sandbox, where there is no customer. */
  customerId: string | null;
  conversationId: string | null;
  currency: string;
  productEnquiries: boolean;
  stockEnquiries: boolean;
  showExactStock: boolean;
  orderAssistance: boolean;
  draftOrders: boolean;
  /** Latest inbound customer text — required for confirm_order. */
  lastCustomerMessage: string;
  orders?: OrderToolOps;
  onHandover?: (reason: string, summary: string) => void;
}

const searchArgs = z.object({
  query: z.string().trim().min(1).max(120),
  category: z.string().trim().max(80).optional(),
  limit: z.number().int().min(1).max(8).optional(),
});

const idArgs = z.object({
  product_id: z.string().trim().min(1).max(40),
});

const stockArgs = z.object({
  variant_id: z.string().trim().min(1).max(40),
  quantity: z.number().int().min(1).max(999).optional(),
});

const policyArgs = z.object({
  topic: z.enum(['greeting', 'hours', 'location', 'delivery', 'payment']),
});

const orderArgs = z.object({
  order_ref: z.string().trim().min(1).max(40),
});

const handoverArgs = z.object({
  reason: z.string().trim().min(1).max(300),
  summary: z.string().trim().min(1).max(1000),
});

const draftItem = z
  .object({
    variant_id: z.string().trim().min(1).max(40),
    quantity: z.number().int().min(1).max(99),
  })
  .strict();

const addressArgs = z
  .object({
    line1: z.string().trim().min(1).max(200),
    line2: z.string().trim().max(200).optional(),
    area: z.string().trim().max(100).optional(),
    city: z.string().trim().max(100).optional(),
    notes: z.string().trim().max(300).optional(),
  })
  .strict();

const draftArgs = z
  .object({
    items: z.array(draftItem).min(1).max(20).optional(),
    fulfilment_method: z.enum(['DELIVERY', 'COLLECTION']).optional(),
    address: addressArgs.nullable().optional(),
    customer_name: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

const createDraftArgs = draftArgs.extend({
  items: z.array(draftItem).min(1).max(20),
});

const draftIdArgs = z.object({ draft_id: z.string().trim().min(1).max(40) }).strict();
const quoteIdArgs = z.object({ quote_id: z.string().trim().min(1).max(40) }).strict();
const paymentLinkArgs = z.object({ order_ref: z.string().trim().min(1).max(40) }).strict();

function band(available: number): 'out' | 'low' | 'in_stock' {
  if (available <= 0) return 'out';
  if (available <= 3) return 'low';
  return 'in_stock';
}

function invalid(error: z.ZodError) {
  return { error: error.issues[0]?.message ?? 'Invalid arguments' };
}

export function toolDeclarations(
  ctx: Pick<
    ToolContext,
    'productEnquiries' | 'stockEnquiries' | 'orderAssistance' | 'draftOrders'
  >,
): ToolDeclaration[] {
  const tools: ToolDeclaration[] = [
    {
      name: 'get_business_policy',
      description:
        'The shop’s exact wording for greeting, hours, location, delivery or payment. Quote it unchanged.',
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string', enum: ['greeting', 'hours', 'location', 'delivery', 'payment'] },
        },
        required: ['topic'],
      },
    },
    {
      name: 'get_order_status',
      description:
        'Status of an order placed by this customer. Refuses any other customer’s order. Never claim payment succeeded beyond what payment_status says. Use this when the customer says they have paid or sends a screenshot.',
      parameters: {
        type: 'object',
        properties: { order_ref: { type: 'string' } },
        required: ['order_ref'],
      },
    },
    {
      name: 'handover_to_owner',
      description:
        'Hand the conversation to the shop owner. Use for complaints, refunds, disputes, abuse, or anything you should not answer.',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string' },
          summary: { type: 'string', description: 'What the owner needs to know, in a few sentences.' },
        },
        required: ['reason', 'summary'],
      },
    },
  ];
  if (ctx.productEnquiries) {
    tools.unshift(
      {
        name: 'search_products',
        description:
          'Find active products by name or description. Returns ids, names, prices and an availability band. Prices here are the only prices you may quote.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            category: { type: 'string' },
            limit: { type: 'integer' },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_product_details',
        description: 'Name, description and price for one product id from search_products.',
        parameters: {
          type: 'object',
          properties: { product_id: { type: 'string' } },
          required: ['product_id'],
        },
      },
      {
        name: 'get_product_variants',
        description: 'Sizes, colours or other options for one product, each with its own price.',
        parameters: {
          type: 'object',
          properties: { product_id: { type: 'string' } },
          required: ['product_id'],
        },
      },
    );
  }
  if (ctx.stockEnquiries) {
    tools.push({
      name: 'check_stock',
      description:
        'Whether a variant can cover a quantity. available is true or false. An exact count is included only when the shop allows it.',
      parameters: {
        type: 'object',
        properties: {
          variant_id: { type: 'string' },
          quantity: { type: 'integer' },
        },
        required: ['variant_id'],
      },
    });
  }
  if (ctx.orderAssistance && ctx.draftOrders) {
    tools.push(
      {
        name: 'create_draft_order',
        description:
          'Start a WhatsApp draft order for this customer. Prices come from the catalogue — never pass a price or total. Accept customer_name only when the customer said it.',
        parameters: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  variant_id: { type: 'string' },
                  quantity: { type: 'integer' },
                },
                required: ['variant_id', 'quantity'],
              },
            },
            fulfilment_method: { type: 'string', enum: ['DELIVERY', 'COLLECTION'] },
            address: {
              type: 'object',
              properties: {
                line1: { type: 'string' },
                line2: { type: 'string' },
                area: { type: 'string' },
                city: { type: 'string' },
                notes: { type: 'string' },
              },
              required: ['line1'],
            },
            customer_name: { type: 'string' },
          },
          required: ['items'],
          additionalProperties: false,
        },
      },
      {
        name: 'update_draft_order',
        description:
          'Change items, fulfilment or address on the open draft. Never pass prices or totals.',
        parameters: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  variant_id: { type: 'string' },
                  quantity: { type: 'integer' },
                },
                required: ['variant_id', 'quantity'],
              },
            },
            fulfilment_method: { type: 'string', enum: ['DELIVERY', 'COLLECTION'] },
            address: {
              type: 'object',
              properties: {
                line1: { type: 'string' },
                line2: { type: 'string' },
                area: { type: 'string' },
                city: { type: 'string' },
                notes: { type: 'string' },
              },
              required: ['line1'],
            },
            customer_name: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
    );
  }
  if (ctx.orderAssistance) {
    tools.push(
      {
        name: 'calculate_order',
        description:
          'Backend-prices the draft and returns a summary block. Put that summary in your reply unchanged, then ask the customer to confirm.',
        parameters: {
          type: 'object',
          properties: { draft_id: { type: 'string' } },
          required: ['draft_id'],
          additionalProperties: false,
        },
      },
      {
        name: 'confirm_order',
        description:
          'Confirm only after the summary was sent and the customer’s latest message is a clear yes with no changes. Then call generate_payment_link.',
        parameters: {
          type: 'object',
          properties: { quote_id: { type: 'string' } },
          required: ['quote_id'],
          additionalProperties: false,
        },
      },
      {
        name: 'generate_payment_link',
        description:
          'Create a DevDraft payment link for a confirmed order of this conversation. Send payment_message unchanged when present. Never invent a URL.',
        parameters: {
          type: 'object',
          properties: { order_ref: { type: 'string' } },
          required: ['order_ref'],
          additionalProperties: false,
        },
      },
    );
  }
  return tools;
}

export function executeTool(
  name: string,
  args: unknown,
  ctx: ToolContext,
): unknown | Promise<unknown> {
  switch (name) {
    case 'search_products':
      return searchProducts(args, ctx);
    case 'get_product_details':
      return productDetails(args, ctx);
    case 'get_product_variants':
      return productVariants(args, ctx);
    case 'check_stock':
      return checkStock(args, ctx);
    case 'get_business_policy':
      return businessPolicy(args, ctx);
    case 'get_order_status':
      return orderStatus(args, ctx);
    case 'handover_to_owner':
      return handover(args, ctx);
    case 'create_draft_order':
      return createDraft(args, ctx);
    case 'update_draft_order':
      return updateDraft(args, ctx);
    case 'calculate_order':
      return calculateOrder(args, ctx);
    case 'confirm_order':
      return confirmOrder(args, ctx);
    case 'generate_payment_link':
      return paymentLink(args, ctx);
    default:
      return { error: 'Unknown tool' };
  }
}

function mapDraftInput(parsed: z.infer<typeof draftArgs>) {
  return {
    items: parsed.items?.map((i) => ({ variantId: i.variant_id, quantity: i.quantity })),
    fulfilmentMethod: parsed.fulfilment_method,
    address: parsed.address,
    customerName: parsed.customer_name,
  };
}

function createDraft(args: unknown, ctx: ToolContext) {
  if (!ctx.orderAssistance || !ctx.draftOrders) return { error: 'Order drafting is turned off.' };
  if (!ctx.orders || !ctx.conversationId) return { error: 'Orders are not available here.' };
  const parsed = createDraftArgs.safeParse(args);
  if (!parsed.success) return invalid(parsed.error);
  return ctx.orders.createDraft(mapDraftInput(parsed.data) as {
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
  });
}

function updateDraft(args: unknown, ctx: ToolContext) {
  if (!ctx.orderAssistance || !ctx.draftOrders) return { error: 'Order drafting is turned off.' };
  if (!ctx.orders || !ctx.conversationId) return { error: 'Orders are not available here.' };
  const parsed = draftArgs.safeParse(args);
  if (!parsed.success) return invalid(parsed.error);
  return ctx.orders.updateDraft(mapDraftInput(parsed.data));
}

function calculateOrder(args: unknown, ctx: ToolContext) {
  if (!ctx.orderAssistance) return { error: 'Order assistance is turned off.' };
  if (!ctx.orders) return { error: 'Orders are not available here.' };
  const parsed = draftIdArgs.safeParse(args);
  if (!parsed.success) return invalid(parsed.error);
  return ctx.orders.calculate(parsed.data.draft_id);
}

function confirmOrder(args: unknown, ctx: ToolContext) {
  if (!ctx.orderAssistance) return { error: 'Order assistance is turned off.' };
  if (!ctx.orders) return { error: 'Orders are not available here.' };
  const parsed = quoteIdArgs.safeParse(args);
  if (!parsed.success) return invalid(parsed.error);
  return ctx.orders.confirm(parsed.data.quote_id);
}

function paymentLink(args: unknown, ctx: ToolContext) {
  if (!ctx.orderAssistance) return { error: 'Order assistance is turned off.' };
  if (!ctx.orders) return { error: 'Orders are not available here.' };
  const parsed = paymentLinkArgs.safeParse(args);
  if (!parsed.success) return invalid(parsed.error);
  return ctx.orders.generatePaymentLink(parsed.data.order_ref);
}

function searchProducts(args: unknown, ctx: ToolContext) {
  if (!ctx.productEnquiries) return { error: 'Product search is turned off.' };
  const parsed = searchArgs.safeParse(args);
  if (!parsed.success) return invalid(parsed.error);
  const match = ftsQuery(parsed.data.query);
  if (!match) return { products: [] };
  const rows = ctx.sqlite
    .prepare(
      `select p.id as product_id, p.name, c.name as category,
              min(pv.price_minor) as price_minor,
              max(pv.currency) as currency,
              sum(max(i.on_hand - i.reserved, 0)) as available
       from products p
       join product_variants pv on pv.product_id = p.id
       join inventory i on i.variant_id = pv.id
       left join categories c on c.id = p.category_id
       where p.status = 'ACTIVE'
         and p.id in (select product_id from products_fts where products_fts match @match)
         and (@category is null or c.name = @category collate nocase)
       group by p.id
       limit @limit`,
    )
    .all({
      match,
      category: parsed.data.category ?? null,
      limit: parsed.data.limit ?? 5,
    }) as Array<{
    product_id: string;
    name: string;
    category: string | null;
    price_minor: number;
    currency: string;
    available: number;
  }>;
  return {
    products: rows.map((r) => ({
      product_id: r.product_id,
      name: r.name,
      category: r.category,
      price: formatMoney(r.price_minor, r.currency || ctx.currency, { trimZeros: true }),
      availability: band(r.available),
    })),
  };
}

function productDetails(args: unknown, ctx: ToolContext) {
  if (!ctx.productEnquiries) return { error: 'Product details are turned off.' };
  const parsed = idArgs.safeParse(args);
  if (!parsed.success) return invalid(parsed.error);
  const row = ctx.sqlite
    .prepare(
      `select p.id as product_id, p.name, p.description, p.status, c.name as category,
              min(pv.price_minor) as price_min, max(pv.price_minor) as price_max,
              max(pv.currency) as currency,
              sum(max(i.on_hand - i.reserved, 0)) as available
       from products p
       join product_variants pv on pv.product_id = p.id
       join inventory i on i.variant_id = pv.id
       left join categories c on c.id = p.category_id
       where p.id = ? and p.status = 'ACTIVE'
       group by p.id`,
    )
    .get(parsed.data.product_id) as
    | {
        product_id: string;
        name: string;
        description: string;
        status: string;
        category: string | null;
        price_min: number;
        price_max: number;
        currency: string;
        available: number;
      }
    | undefined;
  if (!row) return { error: 'No active product with that id.' };
  const currency = row.currency || ctx.currency;
  return {
    product_id: row.product_id,
    name: row.name,
    description: row.description.slice(0, 500),
    category: row.category,
    price: formatMoney(row.price_min, currency, { trimZeros: true }),
    priceMax:
      row.price_max === row.price_min
        ? null
        : formatMoney(row.price_max, currency, { trimZeros: true }),
    availability: band(row.available),
  };
}

function productVariants(args: unknown, ctx: ToolContext) {
  if (!ctx.productEnquiries) return { error: 'Product details are turned off.' };
  const parsed = idArgs.safeParse(args);
  if (!parsed.success) return invalid(parsed.error);
  const product = ctx.sqlite
    .prepare(`select id, option_names from products where id = ? and status = 'ACTIVE'`)
    .get(parsed.data.product_id) as { id: string; option_names: string } | undefined;
  if (!product) return { error: 'No active product with that id.' };
  const optionNames = JSON.parse(product.option_names || '[]') as string[];
  const rows = ctx.sqlite
    .prepare(
      `select pv.id as variant_id, pv.option_values, pv.price_minor, pv.currency,
              max(i.on_hand - i.reserved, 0) as available
       from product_variants pv
       join inventory i on i.variant_id = pv.id
       where pv.product_id = ?
       order by pv.sort_order, pv.created_at`,
    )
    .all(parsed.data.product_id) as Array<{
    variant_id: string;
    option_values: string;
    price_minor: number;
    currency: string;
    available: number;
  }>;
  return {
    product_id: product.id,
    variants: rows.map((r) => {
      const values = JSON.parse(r.option_values || '{}') as Record<string, string>;
      const item: Record<string, unknown> = {
        variant_id: r.variant_id,
        label: variantLabel(optionNames, values),
        price: formatMoney(r.price_minor, r.currency || ctx.currency, { trimZeros: true }),
        availability: band(r.available),
      };
      if (ctx.showExactStock) item.availableCount = r.available;
      return item;
    }),
  };
}

function checkStock(args: unknown, ctx: ToolContext) {
  if (!ctx.stockEnquiries) return { error: 'Stock checks are turned off.' };
  const parsed = stockArgs.safeParse(args);
  if (!parsed.success) return invalid(parsed.error);
  const row = ctx.sqlite
    .prepare(
      `select max(i.on_hand - i.reserved, 0) as available
       from inventory i
       join product_variants pv on pv.id = i.variant_id
       join products p on p.id = pv.product_id
       where i.variant_id = ? and p.status = 'ACTIVE'`,
    )
    .get(parsed.data.variant_id) as { available: number } | undefined;
  if (!row) return { error: 'No active variant with that id.' };
  const quantity = parsed.data.quantity ?? 1;
  const result: Record<string, unknown> = {
    variant_id: parsed.data.variant_id,
    quantity,
    available: row.available >= quantity,
  };
  if (ctx.showExactStock) result.availableCount = row.available;
  return result;
}

function businessPolicy(args: unknown, ctx: ToolContext) {
  const parsed = policyArgs.safeParse(args);
  if (!parsed.success) return invalid(parsed.error);
  const row = ctx.sqlite
    .prepare(`select text, enabled from preset_responses where key = ?`)
    .get(parsed.data.topic) as { text: string; enabled: number } | undefined;
  if (!row || !row.enabled) return { error: `No saved reply for ${parsed.data.topic}.` };
  return { topic: parsed.data.topic satisfies PresetKey, text: row.text };
}

function orderStatus(args: unknown, ctx: ToolContext) {
  const parsed = orderArgs.safeParse(args);
  if (!parsed.success) return invalid(parsed.error);
  if (!ctx.customerId) return { error: 'No customer to look up in the sandbox.' };
  const row = ctx.sqlite
    .prepare(
      `select ref, status, payment_status, fulfilment_status, total_minor, currency
       from orders where ref = ? and customer_id = ?`,
    )
    .get(parsed.data.order_ref, ctx.customerId) as
    | {
        ref: string;
        status: string;
        payment_status: string;
        fulfilment_status: string;
        total_minor: number;
        currency: string;
      }
    | undefined;
  if (!row) return { error: 'No order with that reference for this customer.' };
  return {
    order_ref: row.ref,
    status: row.status,
    payment_status: row.payment_status,
    fulfilment_status: row.fulfilment_status,
    total: formatMoney(row.total_minor, row.currency, { trimZeros: true }),
  };
}

function handover(args: unknown, ctx: ToolContext) {
  const parsed = handoverArgs.safeParse(args);
  if (!parsed.success) return invalid(parsed.error);
  ctx.onHandover?.(parsed.data.reason, parsed.data.summary);
  return { handedOver: true };
}
