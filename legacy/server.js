import 'dotenv/config';
import express from 'express';
import crypto from 'crypto';
import * as store from './lib/store.js';
import * as agent from './lib/agent.js';
import * as devdraft from './lib/devdraft.js';
import * as wa from './lib/whatsapp.js';

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- DevDraft webhook (raw body for signature check; mount before json parser) ----------
app.post('/webhooks/devdraft', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
  const raw = req.body;
  const sigHeader = req.get(process.env.DEVDRAFT_SIGNATURE_HEADER || 'x-devdraft-signature');
  const check = devdraft.verifySignature(raw, sigHeader);
  let event; try { event = JSON.parse(raw.toString('utf8')); } catch { return res.status(400).send('bad json'); }

  const eventId = event.id || event.eventId || crypto.createHash('sha256').update(raw).digest('hex');
  const type = String(event.type || event.event || event.eventType || '');
  const rec = { id: eventId, type, verified: check.ok, reason: check.reason || null, at: new Date().toISOString(), outcome: '' };

  if (!check.ok) { rec.outcome = 'rejected'; store.recordEvent(rec); return res.status(401).send('invalid signature'); }
  if (store.seenEvent(eventId)) return res.status(200).send('duplicate');

  // Match to an order: by our ref in the payload, or by payment-link id.
  const s = raw.toString('utf8');
  const ref = (s.match(/SNP-\d+/) || [])[0];
  const order = (ref && store.getOrder(ref)) || store.listOrders().find(o => o.payment?.linkId && s.includes(o.payment.linkId));
  rec.orderRef = order?.ref || null;

  if (!order) rec.outcome = 'no matching order';
  else if (/complet|succe|paid/i.test(type)) {
    rec.outcome = store.markPaid(order, eventId) ? 'marked PAID' : 'already paid';
    if (rec.outcome === 'marked PAID') {
      const phone = order.customer.phone;
      store.addMessage(phone, 'system', `Payment verified for ${order.ref}`);
      if (order.channel === 'WHATSAPP') wa.send(phone, `✅ Payment received for order ${order.ref}. Thank you! We'll be in touch about delivery/collection.`).catch(() => {});
      wa.notifyOwner(`💰 ${order.ref} PAID — ${order.total} USD`);
    }
  } else if (/fail|cancel|expire/i.test(type)) { store.updateOrder(order.id, { paymentStatus: 'FAILED' }); rec.outcome = 'marked FAILED'; }
  else rec.outcome = 'ignored type';

  store.recordEvent(rec);
  res.status(200).send('ok');
});

app.use(express.json({ limit: '15mb' }));

// ---------- simple admin auth (Basic) ----------
function admin(req, res, next) {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return next();
  const [, b64] = (req.get('authorization') || '').split(' ');
  const [, pass] = Buffer.from(b64 || '', 'base64').toString().split(':');
  if (pass === pw) return next();
  res.set('WWW-Authenticate', 'Basic realm="SnapSell admin"').status(401).send('auth required');
}
app.get('/admin.html', admin);
app.use(express.static('public'));

const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch(e => { console.error(e); res.status(500).json({ error: e.message }); });

// ---------- public ----------
app.get('/api/health', (req, res) => res.json({ ok: true, whatsapp: wa.state.status, ai: !!process.env.GEMINI_API_KEY, devdraft: !!process.env.DEVDRAFT_CLIENT_KEY }));
app.get('/api/products', (req, res) => res.json(store.listProducts({ activeOnly: true }).map(({ id, name, description, price, stock, image, caption }) => ({ id, name, description, price, stock, image, caption }))));
app.get('/api/orders/:ref/status', (req, res) => { const o = store.getOrder(req.params.ref); res.json(o ? { ref: o.ref, paymentStatus: o.paymentStatus, status: o.status, total: o.total } : { error: 'not found' }); });

// Website checkout: prices recalculated server-side
app.post('/api/checkout', wrap(async (req, res) => {
  const { items, name, phone, address } = req.body || {};
  if (!name || !phone) return res.status(400).json({ error: 'Name and phone are required' });
  const order = store.createOrder({ items, channel: 'WEBSITE', customer: { name, phone: String(phone).replace(/\D/g, ''), address: address || null } });
  if (order.error) return res.status(400).json(order);
  const pay = await devdraft.createPaymentLinkForOrder(order);
  res.json({ ref: order.ref, total: order.total, paymentUrl: pay.url });
}));

// Web chat with the same agent (fallback for WhatsApp)
app.post('/api/chat', wrap(async (req, res) => {
  const { sessionId, text, media } = req.body || {};
  const phone = `web-${String(sessionId || 'anon').replace(/[^\w-]/g, '').slice(0, 40)}`;
  const out = await agent.chat({ phone, channel: 'WEBSITE', text, media: media || [] });
  res.json(out);
}));

// ---------- admin ----------
app.post('/api/admin/snap', admin, wrap(async (req, res) => res.json(await agent.extractListing(req.body || {}))));
app.post('/api/admin/products', admin, wrap(async (req, res) => {
  const { name, description, price, stock, image, caption } = req.body || {};
  if (!name || !(Number(price) > 0)) return res.status(400).json({ error: 'name and price required' });
  res.json(store.addProduct({ name, description, price, stock, image, caption }));
}));
app.patch('/api/admin/products/:id', admin, (req, res) => res.json(store.updateProduct(req.params.id, req.body || {}) || { error: 'not found' }));
app.get('/api/admin/products', admin, (req, res) => res.json(store.listProducts()));
app.get('/api/admin/orders', admin, (req, res) => res.json(store.listOrders()));
app.post('/api/admin/orders/:ref/link', admin, wrap(async (req, res) => {
  const o = store.getOrder(req.params.ref); if (!o) return res.status(404).json({ error: 'not found' });
  res.json(await devdraft.createPaymentLinkForOrder(o));
}));
app.post('/api/admin/test-link', admin, wrap(async (req, res) => {           // Phase 1 smoke test
  const p = store.listProducts({ activeOnly: true })[0];
  if (!p) return res.status(400).json({ error: 'Add a product first' });
  const order = store.createOrder({ items: [{ product_id: p.id, quantity: 1 }], channel: 'WEBSITE', customer: { name: 'Test', phone: 'test' } });
  if (order.error) return res.status(400).json(order);
  res.json({ ref: order.ref, ...(await devdraft.createPaymentLinkForOrder(order)) });
}));
app.get('/api/admin/conversations', admin, (req, res) => res.json(store.listConvos()));
app.post('/api/admin/conversations/:phone/mode', admin, (req, res) => res.json(store.setMode(req.params.phone, req.body.mode === 'HUMAN' ? 'HUMAN' : 'AI_AUTO')));
app.post('/api/admin/conversations/:phone/reply', admin, wrap(async (req, res) => {
  store.setMode(req.params.phone, 'HUMAN');                                   // owner replying = takeover
  if (req.params.phone.startsWith('web-')) store.addMessage(req.params.phone, 'owner', req.body.text);
  else await wa.send(req.params.phone, req.body.text);
  res.json({ ok: true });
}));
app.get('/api/admin/settings', admin, (req, res) => res.json({ ...store.settings(), totals: store.totals(), limits: { perTx: +process.env.MAX_TX_USD || 5, total: +process.env.MAX_TOTAL_USD || 50 } }));
app.post('/api/admin/settings', admin, (req, res) => res.json(store.setSettings({ aiEnabled: !!req.body.aiEnabled })));
app.get('/api/admin/whatsapp', admin, (req, res) => res.json(wa.state));
app.get('/api/admin/events', admin, (req, res) => res.json(store.events()));
app.get('/api/admin/devdraft-health', admin, wrap(async (req, res) => res.json(await devdraft.health())));

app.listen(PORT, () => {
  console.log(`SnapSell on http://localhost:${PORT}  (admin: /admin.html)`);
  if (process.env.ENABLE_WHATSAPP === 'true') wa.start().catch(e => { wa.state.status = 'error'; wa.state.error = e.message; console.error('[wa]', e.message); });
});
