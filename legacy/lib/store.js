// Minimal JSON-file store. Swap for Postgres/Prisma after the hackathon.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const DIR = path.resolve('data');
const FILE = path.join(DIR, 'db.json');

const empty = () => ({
  products: [],
  orders: [],
  conversations: {},   // phone -> { mode, messages[], draft, name }
  webhookEvents: [],
  settings: { aiEnabled: true },
  totals: { linkedUsd: 0 },
  counters: { order: 100 }
});

let db = empty();
if (fs.existsSync(FILE)) {
  try { db = { ...empty(), ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch { /* start fresh */ }
}

export function save() {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
}

export const id = (p) => `${p}_${crypto.randomBytes(5).toString('hex')}`;
export const money = (n) => Math.round(Number(n) * 100) / 100;

// ---------- products ----------
export function listProducts({ activeOnly = false } = {}) {
  return db.products.filter(p => !activeOnly || (p.active && p.stock > 0));
}
export function getProduct(pid) { return db.products.find(p => p.id === pid); }
export function addProduct({ name, description = '', price, stock = 1, image = null, caption = '' }) {
  const p = { id: id('prd'), name, description, price: money(price), stock: Number(stock) || 0,
    image, caption, active: true, createdAt: new Date().toISOString() };
  db.products.unshift(p); save(); return p;
}
export function updateProduct(pid, patch) {
  const p = getProduct(pid); if (!p) return null;
  Object.assign(p, patch); if (patch.price != null) p.price = money(patch.price);
  save(); return p;
}
export function searchProducts(q = '') {
  const terms = String(q).toLowerCase().split(/\s+/).filter(Boolean);
  return listProducts({ activeOnly: true })
    .map(p => ({ p, score: terms.reduce((s, t) => s + (`${p.name} ${p.description}`.toLowerCase().includes(t) ? 1 : 0), 0) }))
    .filter(x => !terms.length || x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ p }) => ({ id: p.id, name: p.name, description: p.description, price_usd: p.price, in_stock: p.stock }));
}

// ---------- orders ----------
export function calculate(items) {
  const lines = [];
  for (const it of items || []) {
    const p = getProduct(it.product_id);
    const qty = Math.max(1, parseInt(it.quantity, 10) || 1);
    if (!p || !p.active) return { error: `Unknown product ${it.product_id}` };
    if (p.stock < qty) return { error: `Only ${p.stock} of ${p.name} in stock` };
    lines.push({ product_id: p.id, name: p.name, quantity: qty, unit_price: p.price, amount: money(p.price * qty) });
  }
  if (!lines.length) return { error: 'No items' };
  return { lines, total: money(lines.reduce((s, l) => s + l.amount, 0)), currency: 'USD' };
}

export function createOrder({ items, customer, channel }) {
  const calc = calculate(items);
  if (calc.error) return calc;
  const max = Number(process.env.MAX_TX_USD || 5);
  if (calc.total > max) return { error: `Order total ${calc.total} USD is over the ${max} USD limit. Reduce the quantity.` };
  const order = {
    id: id('ord'),
    ref: `SNP-${++db.counters.order}`,
    channel,                       // WEBSITE | WHATSAPP
    customer,                      // { name, phone, address? }
    lines: calc.lines,             // price snapshot
    total: calc.total,
    status: 'PENDING_PAYMENT',     // fulfilment-ish state
    paymentStatus: 'UNPAID',       // separate payment state
    payment: null,
    createdAt: new Date().toISOString()
  };
  db.orders.unshift(order); save(); return order;
}
export function getOrder(key) { return db.orders.find(o => o.id === key || o.ref === key); }
export function listOrders() { return db.orders; }
export function updateOrder(oid, patch) { const o = getOrder(oid); if (!o) return null; Object.assign(o, patch); save(); return o; }

export function markPaid(order, eventId) {
  if (order.paymentStatus === 'PAID') return false;      // idempotent: no double stock deduction
  for (const l of order.lines) { const p = getProduct(l.product_id); if (p) p.stock = Math.max(0, p.stock - l.quantity); }
  order.paymentStatus = 'PAID'; order.status = 'PROCESSING'; order.paidAt = new Date().toISOString(); order.paidEvent = eventId;
  save(); return true;
}

// ---------- conversations ----------
export function convo(phone) {
  if (!db.conversations[phone]) db.conversations[phone] = { phone, mode: 'AI_AUTO', name: null, messages: [], updatedAt: null };
  return db.conversations[phone];
}
export function addMessage(phone, role, text, meta = {}) {
  const c = convo(phone);
  c.messages.push({ role, text, ...meta, at: new Date().toISOString() });
  if (c.messages.length > 60) c.messages = c.messages.slice(-60);
  c.updatedAt = new Date().toISOString(); save(); return c;
}
export function listConvos() { return Object.values(db.conversations).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')); }
export function setMode(phone, mode) { const c = convo(phone); c.mode = mode; save(); return c; }

// ---------- settings / limits / webhooks ----------
export const settings = () => db.settings;
export function setSettings(patch) { Object.assign(db.settings, patch); save(); return db.settings; }
export const totals = () => db.totals;
export function addLinked(usd) { db.totals.linkedUsd = money(db.totals.linkedUsd + usd); save(); }
export function seenEvent(eid) { return db.webhookEvents.some(e => e.id === eid && e.verified); }
export function recordEvent(e) { db.webhookEvents.unshift(e); db.webhookEvents = db.webhookEvents.slice(0, 200); save(); }
export const events = () => db.webhookEvents;
