// whatsapp-web.js adapter (unofficial; risk of account restriction — use a test/business number).
// Kept behind send()/start() so it can be swapped for the official WhatsApp Business Platform later.
import QRCode from 'qrcode';
import * as agent from './agent.js';
import * as store from './store.js';

let client = null;
export const state = { status: 'disabled', qr: null, number: null, error: null };
const seen = new Set();                     // de-dup provider message ids
const MAX_MEDIA = 8 * 1024 * 1024;          // 8 MB

export async function start() {
  const { default: pkg } = await import('whatsapp-web.js');
  const { Client, LocalAuth } = pkg;
  state.status = 'starting';
  client = new Client({ authStrategy: new LocalAuth({ dataPath: '.wwebjs_auth' }),
    puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] } });

  client.on('qr', async (qr) => { state.status = 'qr'; state.qr = await QRCode.toDataURL(qr); });
  client.on('authenticated', () => { state.status = 'authenticated'; state.qr = null; });
  client.on('ready', () => { state.status = 'ready'; state.number = client.info?.wid?.user || null; console.log('[wa] ready as', state.number); });
  client.on('auth_failure', (m) => { state.status = 'auth_failure'; state.error = String(m); });
  client.on('disconnected', (r) => { state.status = 'disconnected'; state.error = String(r); });

  client.on('message', async (msg) => {
    try {
      if (msg.fromMe || msg.from.endsWith('@g.us') || msg.from === 'status@broadcast') return;
      if (seen.has(msg.id._serialized)) return; seen.add(msg.id._serialized);
      const phone = msg.from.replace(/@.*/, '');
      const media = [];
      if (msg.hasMedia) {
        const m = await msg.downloadMedia();
        if (m && m.data && Buffer.byteLength(m.data, 'base64') <= MAX_MEDIA && /^(image|audio)\//.test(m.mimetype)) {
          media.push({ mime: m.mimetype.split(';')[0], data: m.data });   // kept in memory only, never written to disk
        }
      }
      let name; try { name = (await msg.getContact())?.pushname; } catch {}
      const chat = await msg.getChat(); chat.sendStateTyping().catch(() => {});
      const out = await agent.chat({ phone, channel: 'WHATSAPP', text: msg.body || '', media, customerName: name });
      if (out.reply) await client.sendMessage(msg.from, out.reply);
      if (out.handover) notifyOwner(`🙋 Chat from +${phone} needs you: ${out.handover}`);
      if (out.orderRef) notifyOwner(`🧾 New order ${out.orderRef} from +${phone}`);
    } catch (e) { console.error('[wa] message error', e.message); }
  });

  await client.initialize();
}

export async function send(phone, text) {
  if (!client || state.status !== 'ready') throw new Error('WhatsApp not connected');
  await client.sendMessage(`${String(phone).replace(/\D/g, '')}@c.us`, text);
  store.addMessage(phone, 'owner', text);
}

export function notifyOwner(text) {
  const owner = process.env.OWNER_WHATSAPP;
  if (owner && client && state.status === 'ready') client.sendMessage(`${owner}@c.us`, text).catch(() => {});
}

export async function logout() { if (client) { await client.logout().catch(() => {}); state.status = 'disconnected'; } }
