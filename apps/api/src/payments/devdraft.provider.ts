// DevDraft REST adapter (spec §7). Built from the published guides, checked 2026-10-31:
//   POST /api/v0/payment-links with x-client-key / x-client-secret / idempotency-key headers;
//   webhooks signed with HMAC-SHA256 over the raw body, header `x-webhook-signature: sha256=<hex>`.
// Not documented, so configured rather than guessed (spec §7.5): the customer-facing URL field,
// the webhook payload shape, and a status-lookup endpoint. See test/fixtures/devdraft/README.md.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { formatMoney, minorDigits, toMinor } from '@snapsell/shared';
import { type AppConfig } from '../config/config.js';
import {
  type CreatedPaymentLink,
  type PaymentEvent,
  type PaymentLinkRequest,
  type PaymentProvider,
  PaymentProviderError,
} from './payment.provider.js';

const TIMEOUT_MS = 20_000;

export function signBody(secret: string, rawBody: Buffer | string) {
  return `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
}

export function verifyHmac(secret: string, rawBody: Buffer, header: string | string[] | undefined) {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return false;
  const expected = Buffer.from(signBody(secret, rawBody));
  const given = Buffer.from(
    value.trim().startsWith('sha256=') ? value.trim() : `sha256=${value.trim()}`,
  );
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Major-unit number as DevDraft expects (29.99), from integer minor units. */
export function toProviderAmount(minor: number, currency: string) {
  return Number(formatMoney(minor, currency.toUpperCase()).replace(/[^\d.]/g, ''));
}

function pick(obj: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined),
      obj,
    );
}

function firstString(obj: unknown, paths: string[]) {
  for (const p of paths) {
    const v = pick(obj, p);
    if (typeof v === 'string' && v) return v;
  }
  return null;
}

/**
 * Reads a webhook body. Field names are the documented `payment.completed` / `payment.failed`
 * types plus the most likely shapes for ids and amounts; confirm against a real delivery and
 * trim this list (spec §7.4).
 */
export function parseDevDraftEvent(rawBody: Buffer): PaymentEvent {
  const body = JSON.parse(rawBody.toString('utf8')) as unknown;
  const rawType = firstString(body, ['type', 'event', 'eventType']) ?? '';
  const amount = pick(body, 'data.amount') ?? pick(body, 'amount');
  const currency = firstString(body, ['data.currency', 'currency']);
  let amountMinor: number | null = null;
  if ((typeof amount === 'number' || typeof amount === 'string') && currency) {
    try {
      amountMinor = toMinor(Number(amount).toFixed(minorDigits(currency)), currency);
    } catch {
      amountMinor = null;
    }
  }
  return {
    eventId:
      firstString(body, ['id', 'eventId', 'event_id']) ??
      `sha256:${createHash('sha256').update(rawBody).digest('hex')}`,
    rawType,
    type:
      rawType === 'payment.completed'
        ? 'payment.completed'
        : rawType === 'payment.failed'
          ? 'payment.failed'
          : 'other',
    providerLinkId: firstString(body, [
      'data.paymentLinkId',
      'data.payment_link_id',
      'data.paymentLink.id',
      'data.linkId',
      'paymentLinkId',
    ]),
    providerPaymentId: firstString(body, ['data.id', 'data.paymentId', 'data.transactionId']),
    amountMinor,
    currency: currency?.toLowerCase() ?? null,
  };
}

export class DevDraftProvider implements PaymentProvider {
  readonly name = 'DEVDRAFT' as const;

  constructor(
    private readonly config: AppConfig['devdraft'],
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  get mode() {
    return this.config.mode;
  }

  supportsCurrency(currency: string) {
    return this.config.currencies.includes(currency.toLowerCase());
  }

  async createLink(req: PaymentLinkRequest): Promise<CreatedPaymentLink> {
    const body = {
      title: req.title.slice(0, 100),
      description: req.description.slice(0, 500),
      // A unique slug per attempt; the documented response echoes it back as `url`.
      url: `${req.orderRef.toLowerCase()}-${req.idempotencyKey.slice(0, 8)}`,
      linkType: this.config.linkType,
      amount: toProviderAmount(req.amountMinor, req.currency),
      currency: req.currency.toLowerCase(),
      recurringType: 'ONE_TIME',
      limitPayments: true,
      maxPayments: 1,
      allowQuantityAdjustment: false,
      requirePhoneNumber: false,
      collectAddress: false,
      ...(req.expiresAt ? { expiration_date: req.expiresAt.toISOString() } : {}),
    };
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.config.baseUrl}/api/v0/payment-links`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-client-key': this.config.clientKey ?? '',
          'x-client-secret': this.config.clientSecret ?? '',
          'idempotency-key': req.idempotencyKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new PaymentProviderError(
        `DevDraft unreachable: ${err instanceof Error ? err.message : String(err)}`,
        true,
      );
    }
    const text = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text.slice(0, 1000) };
    }
    if (!res.ok) {
      throw new PaymentProviderError(
        `DevDraft ${res.status}: ${text.slice(0, 300)}`,
        res.status >= 500 || res.status === 429,
        data,
      );
    }
    const id = firstString(data, ['id']);
    if (!id) throw new PaymentProviderError('DevDraft response has no link id', false, data);
    return { providerLinkId: id, paymentUrl: this.paymentUrl(data), raw: data };
  }

  verifySignature(rawBody: Buffer, headers: Record<string, string | string[] | undefined>) {
    return verifyHmac(this.config.webhookSecret, rawBody, headers[this.config.signatureHeader]);
  }

  parseEvent(rawBody: Buffer) {
    return parseDevDraftEvent(rawBody);
  }

  /** Spec §7.2: send the URL DevDraft returns; never build one from an undocumented pattern. */
  private paymentUrl(data: unknown) {
    if (this.config.paymentUrlField) {
      const url = firstString(data, [this.config.paymentUrlField]);
      if (url && /^https:\/\//.test(url)) return url;
      throw new PaymentProviderError(
        `DevDraft response has no https URL at "${this.config.paymentUrlField}"`,
        false,
        data,
      );
    }
    if (this.config.paymentUrlTemplate) {
      const slug = firstString(data, ['url']);
      if (!slug)
        throw new PaymentProviderError(
          'DevDraft response has no "url" slug for the configured template',
          false,
          data,
        );
      return this.config.paymentUrlTemplate.replace('{url}', encodeURIComponent(slug));
    }
    throw new PaymentProviderError(
      'The DevDraft payment URL format is not confirmed. Set DEVDRAFT_PAYMENT_URL_FIELD or DEVDRAFT_PAYMENT_URL_TEMPLATE once DevDraft confirms it.',
      false,
      data,
    );
  }
}
