# SnapSell — Snap. Chat. Get Paid.

WhatsApp-first shop for informal sellers. The seller snaps a product, a Gemini/Gemma agent sells it over WhatsApp (text, voice notes, photos), and DevDraft payment links get the seller paid.

## Run (5 minutes)

```bash
npm install
cp .env.example .env        # fill GEMINI_API_KEY, DEVDRAFT_CLIENT_KEY/SECRET, ADMIN_PASSWORD
npm start                   # http://localhost:3000  · dashboard: /admin.html
```

WhatsApp: set `ENABLE_WHATSAPP=true`, restart, open **Dashboard → Settings**, scan the QR with the shop phone (WhatsApp → Linked devices).

Webhooks need a public URL:

```bash
npx cloudflared tunnel --url http://localhost:3000     # or: ngrok http 3000
```

Set `PUBLIC_BASE_URL` to the tunnel URL and register `https://<tunnel>/webhooks/devdraft` in DevDraft for payment completed/failed events. Put the signing secret in `DEVDRAFT_WEBHOOK_SECRET`.

## Confirm at kickoff (5 values)

| `.env` key | What to check in DevDraft docs |
| --- | --- |
| `DEVDRAFT_BASE_URL` | Production base URL |
| `DEVDRAFT_LINK_TYPE`, `DEVDRAFT_RECURRING_TYPE`, `DEVDRAFT_CURRENCY` | Allowed enum values for a one-time payment link |
| `DEVDRAFT_SIGNATURE_HEADER` | Webhook signature header name (HMAC-SHA256 over raw body is assumed) |

Fastest check: **Dashboard → Settings → Create test payment link**. If the response has no URL field the app recognises, the raw response is shown so you can see the right field.

## Demo flow

1. **Snap**: Dashboard → photo + "blue chitenge $2, 5 pieces" → ✨ Fill with AI → Publish.
2. **Chat**: WhatsApp the shop (or use the storefront chat bubble): "do you have chitenge? I want 2".
3. Agent searches stock, shows summary, asks for YES and your name.
4. Reply "yes" → order created → real DevDraft payment link sent.
5. Pay → webhook → order shows **PAID** in the dashboard; customer gets a WhatsApp confirmation.
6. Inbox → **Take over** → AI stops replying instantly.

## Safety built in

- Per-payment cap `MAX_TX_USD=5` and total cap `MAX_TOTAL_USD=50` (enforced server-side).
- Prices/totals always recalculated from the store; the AI can't set them.
- `confirm_order` is refused unless the customer's latest message is an explicit yes.
- Order is PAID only via a signature-verified webhook; duplicate events are ignored, stock is deducted once.
- Idempotency key on every payment-link request.
- Keys live in `.env` (git-ignored) and never reach the browser or the model.

**Before 3:30 PM CAT:** refund every test payment in DevDraft and confirm total volume < $50.

## Files

| File | Job |
| --- | --- |
| `server.js` | API, storefront, dashboard, webhook |
| `lib/agent.js` | Gemini function-calling sales agent + Snap extraction |
| `lib/devdraft.js` | Payment links, webhook signature check |
| `lib/whatsapp.js` | whatsapp-web.js adapter (unofficial — use a test number) |
| `lib/store.js` | JSON store in `data/` (swap for Postgres later) |
| `public/` | `index.html` shop + chat, `admin.html` dashboard, `thanks.html` status |

Model: set `GEMINI_MODEL` to the exact Gemma 4 model id from AI Studio. If it doesn't support function calling or audio, use a Gemini Flash model for the agent.
