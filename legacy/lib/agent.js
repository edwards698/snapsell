// Gemini/Gemma sales agent with backend-validated function calls.
import * as store from './store.js';
import * as devdraft from './devdraft.js';

const env = (k, d) => process.env[k] ?? d;
const API = () => `https://generativelanguage.googleapis.com/v1beta/models/${env('GEMINI_MODEL', 'gemini-2.5-flash')}:generateContent?key=${env('GEMINI_API_KEY', '')}`;

async function gemini(body) {
  const res = await fetch(API(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

// ---------------- Snap: photo/voice -> product draft ----------------
export async function extractListing({ imageBase64, imageMime = 'image/jpeg', audioBase64, audioMime = 'audio/ogg', note = '' }) {
  const parts = [];
  if (imageBase64) parts.push({ inline_data: { mime_type: imageMime, data: imageBase64 } });
  if (audioBase64) parts.push({ inline_data: { mime_type: audioMime, data: audioBase64 } });
  parts.push({ text:
`You help an informal seller in Zambia list a product for sale.
Seller note: "${note}"
From the photo and/or voice note, return ONLY JSON:
{"name": string, "description": string (max 25 words), "price_usd": number or null, "quantity": integer or null, "caption": string (catchy WhatsApp sales line, max 20 words)}
Use the price/quantity the seller states. If none stated, use null. Never invent a price.` });
  const data = await gemini({ contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', temperature: 0.4 } });
  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '{}';
  return JSON.parse(text.replace(/```json|```/g, '').trim());
}

// ---------------- Chat: tool definitions ----------------
const tools = [{ functionDeclarations: [
  { name: 'search_products', description: 'Search the live catalogue. Always use before quoting a product or price.',
    parameters: { type: 'OBJECT', properties: { query: { type: 'STRING' } }, required: ['query'] } },
  { name: 'check_stock', description: 'Get live stock and price for a product id.',
    parameters: { type: 'OBJECT', properties: { product_id: { type: 'STRING' } }, required: ['product_id'] } },
  { name: 'calculate_order', description: 'Calculate trusted totals for items. Use to build the order summary.',
    parameters: { type: 'OBJECT', properties: { items: { type: 'ARRAY', items: { type: 'OBJECT',
      properties: { product_id: { type: 'STRING' }, quantity: { type: 'INTEGER' } }, required: ['product_id', 'quantity'] } } }, required: ['items'] } },
  { name: 'confirm_order', description: 'Create the order ONLY after the customer saw the summary and explicitly said yes. Requires the customer name.',
    parameters: { type: 'OBJECT', properties: {
      items: { type: 'ARRAY', items: { type: 'OBJECT', properties: { product_id: { type: 'STRING' }, quantity: { type: 'INTEGER' } }, required: ['product_id', 'quantity'] } },
      customer_name: { type: 'STRING' }, delivery_address: { type: 'STRING' } }, required: ['items', 'customer_name'] } },
  { name: 'generate_payment_link', description: 'Create the DevDraft payment link for a confirmed order ref.',
    parameters: { type: 'OBJECT', properties: { order_ref: { type: 'STRING' } }, required: ['order_ref'] } },
  { name: 'get_order_status', description: 'Get payment and order status for an order ref.',
    parameters: { type: 'OBJECT', properties: { order_ref: { type: 'STRING' } }, required: ['order_ref'] } },
  { name: 'handover_to_owner', description: 'Hand the chat to the human owner for complaints, refunds, disputes or anything unclear.',
    parameters: { type: 'OBJECT', properties: { reason: { type: 'STRING' } }, required: ['reason'] } }
] }];

const YES = /\b(yes|yeah|yep|ok|okay|confirm|confirmed|proceed|go ahead|sure|ee|eya|inde)\b/i;

async function runTool(name, args, ctx) {
  switch (name) {
    case 'search_products': return { results: store.searchProducts(args.query) };
    case 'check_stock': {
      const p = store.getProduct(args.product_id);
      return p ? { id: p.id, name: p.name, price_usd: p.price, in_stock: p.stock } : { error: 'not found' };
    }
    case 'calculate_order': return store.calculate(args.items);
    case 'confirm_order': {
      // Guard: the customer's latest message must be an explicit confirmation.
      if (!YES.test(ctx.lastUserText || '')) return { error: 'Customer has not explicitly confirmed. Show the summary and ask them to reply yes.' };
      const order = store.createOrder({ items: args.items, channel: ctx.channel,
        customer: { name: args.customer_name, phone: ctx.phone, address: args.delivery_address || null } });
      if (order.error) return order;
      ctx.orderRef = order.ref;
      return { order_ref: order.ref, total_usd: order.total, lines: order.lines };
    }
    case 'generate_payment_link': {
      const o = store.getOrder(args.order_ref);
      if (!o) return { error: 'unknown order' };
      if (o.customer.phone !== ctx.phone) return { error: 'order belongs to another customer' };
      try { const pay = await devdraft.createPaymentLinkForOrder(o); ctx.paymentUrl = pay.url; return { order_ref: o.ref, total_usd: o.total, payment_url: pay.url || 'pending' }; }
      catch (e) { return { error: e.message }; }
    }
    case 'get_order_status': {
      const o = store.getOrder(args.order_ref);
      return o && o.customer.phone === ctx.phone ? { ref: o.ref, payment: o.paymentStatus, status: o.status, total_usd: o.total } : { error: 'not found' };
    }
    case 'handover_to_owner': { store.setMode(ctx.phone, 'HUMAN'); ctx.handover = args.reason; return { ok: true }; }
    default: return { error: 'unknown tool' };
  }
}

function systemPrompt() {
  return `You are the friendly WhatsApp sales assistant for "${env('BUSINESS_NAME', 'SnapSell Demo Shop')}" in Lusaka, Zambia.
Rules (never break):
- Never invent products, prices or stock. Use search_products / check_stock first.
- Prices are in USD. Max order total is ${env('MAX_TX_USD', 5)} USD.
- Before confirming, call calculate_order and show a clear summary: each item, qty, amount, and TOTAL. Then ask "Reply YES to confirm".
- Only call confirm_order after the customer explicitly says yes to that summary. Ask for their full name if unknown.
- After confirm_order, call generate_payment_link and send the exact payment_url returned. Never make up a link.
- Never say an order is paid unless get_order_status says PAID. Screenshots are not proof.
- Complaints, refunds, disputes or anything unclear: call handover_to_owner.
- Be warm and short (WhatsApp style). One question at a time. Match the customer's language (English, Bemba, Nyanja).
- Voice notes and images: understand them in context of the chat. If a photo might match a product, say so and ask to confirm.`;
}

// ---------------- Chat: main loop ----------------
// input: { phone, channel, text, media: [{mime, data(base64)}] }
export async function chat({ phone, channel = 'WHATSAPP', text = '', media = [], customerName }) {
  const c = store.convo(phone);
  if (customerName && !c.name) c.name = customerName;
  const userLabel = text || (media.length ? `[${media.map(m => m.mime.split('/')[0]).join('+')}]` : '');
  store.addMessage(phone, 'user', userLabel, { media: media.map(m => m.mime) });

  if (!store.settings().aiEnabled || c.mode !== 'AI_AUTO') return { reply: null, skipped: c.mode };

  // Bounded history (text only) + current multimodal turn
  const history = c.messages.slice(-16, -1).filter(m => m.text).map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] }));
  const parts = media.map(m => ({ inline_data: { mime_type: m.mime, data: m.data } }));
  parts.push({ text: `${text || '(no text, see media)'}${c.name ? `\n[known customer name: ${c.name}]` : ''}` });
  const contents = [...history, { role: 'user', parts }];

  const ctx = { phone, channel, lastUserText: text, orderRef: null, paymentUrl: null, handover: null, toolLog: [] };
  let reply = '';
  for (let step = 0; step < 6; step++) {
    const data = await gemini({ systemInstruction: { parts: [{ text: systemPrompt() }] }, contents, tools, generationConfig: { temperature: 0.5 } });
    const cand = data.candidates?.[0]?.content;
    if (!cand) break;
    contents.push(cand);
    const calls = (cand.parts || []).filter(p => p.functionCall);
    if (!calls.length) { reply = (cand.parts || []).map(p => p.text || '').join('').trim(); break; }
    const responses = [];
    for (const { functionCall: fc } of calls) {
      const result = await runTool(fc.name, fc.args || {}, ctx);
      ctx.toolLog.push({ tool: fc.name, args: fc.args, result });
      responses.push({ functionResponse: { name: fc.name, response: result } });
    }
    contents.push({ role: 'user', parts: responses });
  }

  // Takeover may have happened while we were thinking: don't send.
  if (store.convo(phone).mode !== 'AI_AUTO' && !ctx.handover) return { reply: null, skipped: 'HUMAN', toolLog: ctx.toolLog };
  if (ctx.handover) reply = reply || "Thanks, I'm passing you to the owner now. They'll reply shortly.";
  if (ctx.paymentUrl && !reply.includes(ctx.paymentUrl)) reply += `\n\nPay here: ${ctx.paymentUrl}`;
  if (!reply) reply = 'Sorry, could you say that again?';

  store.addMessage(phone, 'assistant', reply, { tools: ctx.toolLog.map(t => t.tool) });
  return { reply, orderRef: ctx.orderRef, paymentUrl: ctx.paymentUrl, handover: ctx.handover, toolLog: ctx.toolLog };
}
