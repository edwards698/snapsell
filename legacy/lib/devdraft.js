// DevDraft REST client: payment links + webhook verification.
// Field names follow the DevDraft payment-link guide; confirm against kickoff docs.
import crypto from 'crypto';
import * as store from './store.js';

const env = (k, d) => process.env[k] ?? d;
const BASE = () => env('DEVDRAFT_BASE_URL', 'https://api.devdraft.ai/api/v0').replace(/\/$/, '');

function headers(extra = {}) {
  return {
    'Content-Type': 'application/json',
    'x-client-key': env('DEVDRAFT_CLIENT_KEY', ''),
    'x-client-secret': env('DEVDRAFT_CLIENT_SECRET', ''),
    ...extra
  };
}

async function call(method, path, body, extraHeaders) {
  const res = await fetch(`${BASE()}${path}`, { method, headers: headers(extraHeaders), body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) { const e = new Error(`DevDraft ${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`); e.status = res.status; e.data = data; throw e; }
  return data;
}

export const health = () => call('GET', '/health');

// Find the customer-facing URL in whatever shape the API returns.
function pickUrl(d) {
  if (!d || typeof d !== 'object') return null;
  for (const k of ['paymentUrl', 'payment_url', 'checkoutUrl', 'checkout_url', 'link', 'url', 'shortUrl', 'hostedUrl']) {
    if (typeof d[k] === 'string' && /^https?:\/\//.test(d[k])) return d[k];
  }
  for (const v of Object.values(d)) { if (v && typeof v === 'object') { const u = pickUrl(v); if (u) return u; } }
  return null;
}

export async function createPaymentLinkForOrder(order) {
  const max = Number(env('MAX_TX_USD', 5)), cap = Number(env('MAX_TOTAL_USD', 50));
  if (order.total > max) throw new Error(`Blocked: ${order.total} USD exceeds per-transaction limit of ${max} USD`);
  if (store.totals().linkedUsd + order.total > cap) throw new Error(`Blocked: total volume would exceed ${cap} USD`);
  if (order.payment?.url) return order.payment;                    // already has a link

  const idem = order.payment?.idempotencyKey || crypto.randomUUID(); // reuse on retry
  store.updateOrder(order.id, { payment: { idempotencyKey: idem, status: 'CREATING' } });

  const body = {
    title: `${env('BUSINESS_NAME', 'SnapSell')} order ${order.ref}`,
    description: order.lines.map(l => `${l.quantity} x ${l.name}`).join(', ') + ` | ref ${order.ref}`,
    url: `${env('PUBLIC_BASE_URL', 'http://localhost:3000')}/thanks.html?ref=${order.ref}`,
    linkType: env('DEVDRAFT_LINK_TYPE', 'PRODUCT'),
    amount: order.total,
    currency: env('DEVDRAFT_CURRENCY', 'usdc'),
    recurringType: env('DEVDRAFT_RECURRING_TYPE', 'ONE_TIME'),
    collectName: true,
    collectEmail: false,
    collectPhoneNumber: true
  };

  const data = await call('POST', '/payment-links', body, { 'idempotency-key': idem });
  const url = pickUrl(data);
  const linkId = data.id || data.data?.id || data.paymentLinkId || null;
  const payment = { idempotencyKey: idem, linkId, url, status: 'LINK_CREATED', raw: data, createdAt: new Date().toISOString() };
  store.updateOrder(order.id, { payment });
  store.addLinked(order.total);
  if (!url) console.warn('[devdraft] No URL field recognised in response; check payment.raw on the order:', JSON.stringify(data).slice(0, 400));
  return payment;
}

export const getPaymentLink = (linkId) => call('GET', `/payment-links/${linkId}`);

// HMAC-SHA256 over the raw body. Accepts hex or base64, optional "sha256=" prefix.
export function verifySignature(rawBody, headerValue) {
  const secret = env('DEVDRAFT_WEBHOOK_SECRET', '');
  if (!secret) return { ok: false, reason: 'DEVDRAFT_WEBHOOK_SECRET not set' };
  if (!headerValue) return { ok: false, reason: 'missing signature header' };
  const sig = String(headerValue).replace(/^sha256=/, '').split(',').pop().replace(/^v1=/, '').trim();
  const mac = crypto.createHmac('sha256', secret).update(rawBody);
  const digest = mac.digest();
  for (const expected of [digest.toString('hex'), digest.toString('base64')]) {
    const a = Buffer.from(expected), b = Buffer.from(sig);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return { ok: true };
  }
  return { ok: false, reason: 'signature mismatch' };
}
