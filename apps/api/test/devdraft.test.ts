import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config/config.js';
import {
  DevDraftProvider,
  parseDevDraftEvent,
  signBody,
  toProviderAmount,
} from '../src/payments/devdraft.provider.js';
import { PaymentProviderError } from '../src/payments/payment.provider.js';

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/devdraft/${name}`, import.meta.url));
const SECRET = fixture('webhook-secret.txt').toString();
const CREATED = JSON.parse(fixture('create-payment-link.201.json').toString()) as Record<
  string,
  unknown
>;

function provider(
  env: Record<string, string> = {},
  response: { status: number; body: unknown } = { status: 201, body: CREATED },
) {
  const config = loadConfig({
    NODE_ENV: 'test',
    SESSION_SECRET: 'x'.repeat(32),
    FILE_SIGNING_SECRET: 'y'.repeat(32),
    DEVDRAFT_MODE: 'sandbox',
    DEVDRAFT_CLIENT_KEY: 'ck_test',
    DEVDRAFT_CLIENT_SECRET: 'cs_test',
    DEVDRAFT_WEBHOOK_SECRET: SECRET,
    ...env,
  });
  const fetchMock = vi.fn(
    async () => new Response(JSON.stringify(response.body), { status: response.status }),
  );
  return {
    p: new DevDraftProvider(config.devdraft, fetchMock as unknown as typeof fetch),
    fetchMock,
  };
}

const request = {
  orderRef: 'ORD-00042',
  amountMinor: 75000,
  currency: 'USDC',
  title: 'Shop order ORD-00042',
  description: 'Payment for order ORD-00042',
  expiresAt: new Date('2026-10-31T13:00:00Z'),
  idempotencyKey: '7f6e5d4c-3b2a-4190-8a7b-6c5d4e3f2a1b',
};

describe('DevDraftProvider.createLink', () => {
  it('sends the documented request: headers, idempotency key, one-time link, exact amount', async () => {
    const { p, fetchMock } = provider(
      { DEVDRAFT_PAYMENT_URL_FIELD: 'paymentUrl' },
      { status: 201, body: { ...CREATED, paymentUrl: 'https://checkout.example/abc' } },
    );
    const link = await p.createLink(request);
    expect(link).toMatchObject({
      providerLinkId: '550e8400-e29b-41d4-a716-446655440000',
      paymentUrl: 'https://checkout.example/abc',
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.devdraft.com/api/v0/payment-links');
    expect(init.headers).toMatchObject({
      'x-client-key': 'ck_test',
      'x-client-secret': 'cs_test',
      'idempotency-key': request.idempotencyKey,
    });
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      amount: 750,
      currency: 'usdc',
      recurringType: 'ONE_TIME',
      linkType: 'INVOICE',
      limitPayments: true,
      maxPayments: 1,
      url: 'ord-00042-7f6e5d4c',
      expiration_date: '2026-10-31T13:00:00.000Z',
    });
    expect(body.title).toContain('ORD-00042');
  });

  it('never invents a payment URL from the slug', async () => {
    const { p } = provider();
    await expect(p.createLink(request)).rejects.toThrow(/payment URL format is not confirmed/);
  });

  it('uses a confirmed template when configured', async () => {
    const { p } = provider({ DEVDRAFT_PAYMENT_URL_TEMPLATE: 'https://pay.example.com/{url}' });
    expect((await p.createLink(request)).paymentUrl).toBe(
      'https://pay.example.com/premium-subscription',
    );
  });

  it('marks server errors as retryable and client errors as not', async () => {
    await expect(
      provider({}, { status: 503, body: {} }).p.createLink(request),
    ).rejects.toMatchObject({ retryable: true });
    const err = await provider({}, { status: 400, body: { message: 'bad' } })
      .p.createLink(request)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PaymentProviderError);
    expect(err).toMatchObject({ retryable: false });
  });

  it('only accepts the configured currencies', () => {
    const { p } = provider();
    expect(p.supportsCurrency('USDC')).toBe(true);
    expect(p.supportsCurrency('ZMW')).toBe(false);
  });
});

describe('webhooks', () => {
  const body = fixture('payment-completed.json');

  it('verifies sha256=<hex> HMAC over the raw body', () => {
    const { p } = provider();
    const sig = signBody(SECRET, body);
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(p.verifySignature(body, { 'x-webhook-signature': sig })).toBe(true);
    expect(p.verifySignature(body, { 'x-webhook-signature': sig.slice(7) })).toBe(true);
    expect(
      p.verifySignature(Buffer.concat([body, Buffer.from(' ')]), { 'x-webhook-signature': sig }),
    ).toBe(false);
    expect(p.verifySignature(body, { 'x-webhook-signature': signBody('wrong-secret', body) })).toBe(
      false,
    );
    expect(p.verifySignature(body, {})).toBe(false);
  });

  it('reads the (assumed) event shape', () => {
    expect(parseDevDraftEvent(body)).toEqual({
      eventId: 'evt_01HZX3K9Q4WQ5V7Y8M2N6P0R1S',
      type: 'payment.completed',
      rawType: 'payment.completed',
      providerLinkId: '550e8400-e29b-41d4-a716-446655440000',
      providerPaymentId: 'pay_7d1f0c2e-1b8a-4c55-9a0f-3e2d1c0b9a87',
      amountMinor: 2999,
      currency: 'usdc',
    });
    expect(parseDevDraftEvent(fixture('payment-failed.json')).type).toBe('payment.failed');
  });

  it('falls back to a body hash when an event has no id', () => {
    const e = parseDevDraftEvent(Buffer.from('{"type":"invoice.created"}'));
    expect(e.type).toBe('other');
    expect(e.eventId).toMatch(/^sha256:/);
  });
});

describe('amount conversion', () => {
  it('converts minor units to the provider’s decimal amount', () => {
    expect(toProviderAmount(75000, 'ZMW')).toBe(750);
    expect(toProviderAmount(2999, 'usdc')).toBe(29.99);
    expect(toProviderAmount(123456789, 'USDC')).toBe(1234567.89);
  });
});

describe('config', () => {
  it('refuses fake payments in production and needs keys for real ones', () => {
    const base = { SESSION_SECRET: 'x'.repeat(32), FILE_SIGNING_SECRET: 'y'.repeat(32) };
    expect(() => loadConfig({ ...base, NODE_ENV: 'production', DEVDRAFT_MODE: 'fake' })).toThrow(
      /development only/,
    );
    expect(() => loadConfig({ ...base, DEVDRAFT_MODE: 'live' })).toThrow(/DEVDRAFT_CLIENT_KEY/);
  });
});
