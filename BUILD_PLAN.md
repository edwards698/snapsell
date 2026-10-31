# SnapSell – Build Plan

**Source spec:** `ecommerce_platform_project_plan.md` (v2.1)
**Date:** 2026-10-31 · **Revision:** 4 (Phase 2 built)
**Status:** Phase 1 ✅ · Phase 2 ✅ · next: Phase 3
**Starting point:** hackathon prototype in this folder (`server.js`, `lib/*.js`, `public/*.html`) – Express, JSON-file store, Basic auth, single process.
**Target:** production-ready v1 as described in the spec – Next.js 16 + NestJS 12 + **SQLite** (Drizzle ORM) + on-server file storage + dedicated WhatsApp service, with a modern, mobile-first UI.

This document turns the spec into an ordered, testable build. Each phase has tasks, a definition of done, and the spec acceptance criteria it closes. A phase is not done until its tests pass (spec §12).

---

## 0. Guiding Decisions

### 0.1 Minimal external dependencies

The platform runs on **one server** and depends on as few outside services as possible.

| Concern | Choice | External? |
|---|---|---|
| Database | SQLite (WAL mode) file on the server | No |
| File storage | Server disk (`/data/uploads`) | No |
| Background jobs & schedules | SQLite-backed job queue inside the API process | No |
| Rate limiting, sessions, cache | SQLite + in-process memory (single API instance) | No |
| Real-time updates | Socket.IO, self-hosted in the API | No |
| Image processing | `sharp` on the server | No |
| Fonts, icons, UI components | Bundled at build time (self-hosted) | No |
| Backups | `VACUUM INTO` snapshots on disk + owner download / copy off-server | No (off-site copy is owner's choice) |
| TLS | Caddy reverse proxy (automatic Let's Encrypt) | Certificate issuance only |
| Email | **Resend API** | Yes – required |
| AI | Google Gemini API | Yes – required |
| Payments | DevDraft API | Yes – required |
| WhatsApp | whatsapp-web.js → WhatsApp Web | Yes – required |

The only paid/external platforms are the four required by the spec's own features. Each one sits behind an interface (`EmailProvider`, `AiProvider`, `PaymentProvider`, `MessagingProvider`) so it can be replaced.

### 0.2 Design decisions

These resolve ambiguities in the spec so the build can start. Revisit only if a Phase 0 check disproves one.

| # | Decision | Rationale |
|---|---|---|
| D1 | **Monorepo** (pnpm workspaces + Turborepo): `apps/web`, `apps/api`, `apps/whatsapp`, `packages/db`, `packages/shared`, `packages/ui`. | One repo, shared types and database client, independent processes. |
| D2 | **Money is stored as integer minor units** (`amount_minor INTEGER`, `currency TEXT`). | Avoids float rounding (the prototype uses `Math.round(n*100)/100`). |
| D3 | **Order lifecycle, payment status and fulfilment are separate fields.** `orders.status` = `DRAFT · PENDING_CONFIRMATION · PENDING_PAYMENT · CONFIRMED · CANCELLED · EXPIRED · COMPLETED`; `orders.payment_status` = `UNPAID · LINK_CREATED · PAID · FAILED · REFUNDED`; `orders.fulfilment_status` = `UNFULFILLED · PROCESSING · READY_FOR_COLLECTION · DISPATCHED · DELIVERED`. | The spec's status list mixes `PAID`/`PROCESSING` into one enum while also requiring them to be separate (§3.6). |
| D4 | **Product variants are first-class** (`product_variants` table). Stock lives on the variant; a product without options has one default variant. | Spec requires `get_product_variants` (§6.5) but §9 has no variants table. |
| D5 | **Stock policy: reserve on confirm, deduct on verified payment, release on cancel/expiry.** `inventory.on_hand` and `inventory.reserved`; `available = on_hand − reserved`. Reservation TTL is owner-configurable (default 60 min). | Satisfies §3.3, §6.4 "do not deduct twice", and "no deduction on enquiry". |
| D6 | **The backend, not Gemini, renders structured messages** (order summary, payment instructions, preset replies) from templates. Gemini decides *when* to show them and writes the conversational wrapper. | Guarantees exact prices/totals and consistent format (§5.2). |
| D7 | **Order confirmation is bound to a quote.** `calculate_order` stores a `quote` (items, prices, fees, total, hash, expiry). `confirm_order` accepts only a `quote_id`; the backend checks the customer's next message is an explicit affirmative *to that quote*, and re-validates price and stock. | Stronger than the prototype's YES-regex and prevents Gemini submitting its own items/prices. |
| D8 | **Conversation handling uses a generation counter.** `conversation_controls.generation` increments on every mode change/takeover. AI jobs capture the generation at start; the send step does a compare-and-send; mismatch → drop. | Implements §4.4 steps 2–3 (cancel queued and in-flight AI replies) without races. |
| D9 | **WhatsApp service never touches the database.** It talks to the API over HMAC-authenticated internal HTTP on localhost, and keeps its own small on-disk outbox/inbox buffer so nothing is lost if the API restarts. | Keeps the unofficial integration isolated and swappable (§4.1, §10.2); keeps SQLite single-writer. |
| D10 | **Every external service sits behind an interface** – `MessagingProvider`, `PaymentProvider`, `AiProvider`, `EmailProvider`. | Spec §4.1, §10.2 provider migration. |
| D11 | **Owner password reset** via a time-limited token emailed through **Resend**, **plus** a server CLI `pnpm api reset-owner-password` as a break-glass path. | Single owner; avoids lock-out if email is misconfigured. |
| D12 | **Phone normalisation** with `libphonenumber-js`, default region `ZM`, stored in E.164. Customers are unique on `phone_e164`. | §9.1. WhatsApp IDs (`2609…@c.us`) are mapped to E.164 at the adapter boundary. |
| D13 | **WhatsApp does not render Markdown tables.** Structured messages use WhatsApp formatting (`*bold*`, monospace, line lists). | The §6.3 example table won't render in WhatsApp. |
| D14 | **SQLite is the only database.** WAL mode, `busy_timeout=5000`, `foreign_keys=ON`, `synchronous=NORMAL`. **Only the API process writes**; it runs as a single instance. Stock and order correctness rely on **conditional `UPDATE … WHERE` statements**, not on isolation levels. | Spec §9 named PostgreSQL; this replaces it per owner decision. Single writer suits a single-owner shop and removes a server dependency. |
| D15 | **Enums stored as `TEXT`** with `CHECK` constraints (raw SQL in migrations) and validated by shared zod enums. JSON stored as `TEXT` (Drizzle `mode: 'json'`). Search via **SQLite FTS5** virtual table kept in sync by triggers. | SQLite has no native enums, JSONB, tsvector or pg_trgm. |
| D16 | **Files live on the server disk.** `/data/uploads/public/` (product images, served with long cache headers) and `/data/uploads/private/` (WhatsApp media, served only via authenticated, short-lived signed URLs). Random file names, content-type sniffed from bytes, never trust client names or extensions. | Replaces S3 per owner decision. |
| D17 | **Background jobs use a `jobs` table in SQLite**, polled by a worker inside the API process. Supports dedupe keys, delayed runs, retries with backoff, and per-group serialisation (one job at a time per conversation). | Replaces Redis + BullMQ; no extra server. |
| D18 | **Drizzle ORM on `better-sqlite3`** instead of Prisma. Schema in TypeScript, `CHECK` constraints generated from the shared zod enums, migrations by `drizzle-kit` plus hand-written SQL for FTS5 and triggers. | SQL-first fits SQLite: CHECKs, partial unique indexes, FTS5 and triggers are first-class, and `better-sqlite3` transactions are synchronous, so stock and payment updates can't interleave. Prisma's schema language can't express CHECK constraints, FTS5 tables or triggers, so they would all live in raw SQL outside the schema. |
| D19 | **CSRF: Nest 12's built-in Fetch-Metadata check (`app.enableCsrfProtection()`) plus a per-session token** in the `x-csrf-token` header on every state-changing admin request. Security headers via `app.useSecurityHeaders()`. | Two independent layers; no extra dependency (replaces the planned double-submit cookie + Origin check). |

---

## 1. Target Repository Layout

```text
snapsell/
├─ apps/
│  ├─ web/                 # Next.js (App Router): storefront (/), admin (/admin/*)
│  ├─ api/                 # NestJS: REST API, Socket.IO, job worker, webhooks, file serving
│  └─ whatsapp/            # Node service: whatsapp-web.js + Puppeteer
├─ packages/
│  ├─ db/                  # Drizzle schema (sqlite), migrations (+ raw SQL for FTS5 and triggers)
│  ├─ shared/              # zod schemas, enums, DTO types, money + phone helpers
│  ├─ ui/                  # design tokens + shared components (shadcn/ui-based, owned in repo)
│  └─ config/              # eslint, tsconfig, prettier presets
├─ infra/
│  ├─ docker-compose.yml   # web, api, whatsapp, caddy – no database/cache containers
│  ├─ Caddyfile
│  └─ deploy/              # Dockerfiles, env templates, runbooks, backup scripts
├─ data/                   # (git-ignored, mounted volume in production)
│  ├─ db/snapsell.db
│  ├─ uploads/{public,private}/
│  ├─ backups/
│  └─ wwebjs/              # WhatsApp session – never backed up unencrypted
├─ legacy/                 # the current prototype, moved here for reference, deleted after Phase 7
├─ ecommerce_platform_project_plan.md
└─ BUILD_PLAN.md
```

### What to keep from the prototype

| Prototype piece | Reuse in v1 |
|---|---|
| `lib/agent.js` tool loop & system-prompt rules | Port into `apps/api/src/ai/`; replace tool args with ID/quote-based tools (D7). |
| `lib/devdraft.js` headers, idempotency-key reuse, raw-body HMAC check | Port to `PaymentProvider`. Replace `pickUrl` guessing with the confirmed response field (spec §7.2). |
| `server.js` webhook flow (raw body before JSON parser, dedupe, match, mark paid) | Same flow in NestJS with `rawBody: true`, matching by stored provider IDs, never by regex over the body. |
| `lib/whatsapp.js` QR/state handling | Basis for `apps/whatsapp`. |
| `extractListing` ("Snap" product creation from photo/voice) | Keep as the headline admin feature on the product form (§2.5). |
| Web chat in `public/index.html` | Becomes the **AI test sandbox** in admin AI settings. |
| Hackathon caps `MAX_TX_USD` / `MAX_TOTAL_USD` | Replace with owner-configurable per-order limit; keep a hard env cap in non-production. |

---

## 2. UI/UX Design System

The product must feel like a modern consumer app, not a generic admin template. Two audiences:

- **Customers** – mostly on phones, often on slower mobile data. They need fast pages, clear prices and a checkout that takes under a minute.
- **The owner** – will run the business **from their phone** as much as from a laptop. The admin must be fully usable on a phone, not just "responsive".

### 2.1 Principles

1. **Mobile-first, thumb-first.** Primary actions sit in the bottom third of the screen on mobile (sticky action bars, bottom sheets).
2. **Fast by default.** Server components, minimal client JS on the storefront, optimised images, skeletons instead of spinners.
3. **One obvious next step.** Every screen has a single primary action. Secondary actions are quieter.
4. **Show status, never hide it.** WhatsApp connection, AI mode, payment state and stock are always visible where they matter, using colour **and** icon **and** text.
5. **Trust signals.** Exact prices, clear totals before paying, a "secure payment" step, and order tracking after.
6. **Calm, not busy.** Generous spacing, a restrained palette, motion only where it explains a change.

### 2.2 Stack (all bundled, no runtime CDN)

| Concern | Library |
|---|---|
| Styling | Tailwind CSS v4 with CSS-variable design tokens |
| Components | shadcn/ui (Radix primitives), copied into `packages/ui` and owned by us |
| Icons | lucide-react |
| Fonts | Geist Sans + Geist Mono via `next/font` (self-hosted at build time) |
| Motion | `motion` (Framer Motion), honours `prefers-reduced-motion` |
| Bottom sheets / drawers | `vaul` |
| Toasts | `sonner` |
| Command palette | `cmdk` |
| Tables | TanStack Table |
| Data & cache | TanStack Query, invalidated by Socket.IO events |
| Forms | react-hook-form + zod (same schemas as the API) |
| Charts | Recharts (shadcn chart wrappers) |
| Dates | date-fns, timezone `Africa/Lusaka` |

### 2.3 Design tokens

Defined once in `packages/ui/tokens.css` as CSS variables, with light and dark themes (dark follows the system setting, with a toggle in admin).

| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` | zinc-50 | zinc-950 | Page |
| `--surface` | white | zinc-900 | Cards, sheets |
| `--foreground` | zinc-900 | zinc-50 | Body text |
| `--muted` | zinc-500 | zinc-400 | Secondary text |
| `--primary` | emerald-600 | emerald-500 | Primary buttons, links, brand |
| `--accent` | amber-500 | amber-400 | Highlights, "only N left" |
| `--success` / `--warning` / `--danger` / `--info` | green / amber / red / sky | lighter equivalents | Status chips |
| `--ai` | violet-600 | violet-400 | Everything the AI produced (bubbles, drafts, badges) |
| `--radius` | 12px (cards 16px, chips full) | – | |
| Spacing | 4px scale | – | |
| Type scale | 12 / 14 / 16 / 18 / 20 / 24 / 30 / 36 | – | Body 16px on mobile (prevents iOS zoom) |
| Elevation | 3 levels of soft shadow; borders in dark mode | – | |

All colour pairs must meet **WCAG 2.2 AA** contrast. Money uses tabular numbers (`font-variant-numeric: tabular-nums`) so columns line up.

### 2.4 Storefront UX

**Home / catalogue**
- Sticky header: logo, search, cart button with item count (animated bump on add).
- Horizontally scrolling category chips under the header.
- Product grid: 2 columns on phones, 3–4 on desktop; 4:5 images with blurred placeholders generated by `sharp`; price, compare-at price struck through, stock badge (`In stock` · `Only 3 left` · `Sold out`).
- Instant search: results as you type (debounced), with "no results" suggestions.
- Floating "Order on WhatsApp" button (plain `wa.me` link, no API).

**Product page (mobile)**
```text
┌───────────────────────────┐
│ ←                     🛒 2 │
│ ┌───────────────────────┐ │
│ │   swipeable gallery   │ │
│ │        • ○ ○          │ │
│ └───────────────────────┘ │
│ Wireless Headphones       │
│ K350   ̶K̶4̶2̶0̶   Only 3 left │
│ Colour  (●Black)(○White)  │
│ Description…   Read more  │
│ Delivery & collection  ›  │
├───────────────────────────┤
│ [ – 1 + ]  [ Add to cart ]│  ← sticky action bar
└───────────────────────────┘
```
- Variant pickers as chips; unavailable variants shown crossed out, not hidden.
- "Add to cart" opens the cart as a **bottom sheet** (mobile) / side sheet (desktop) with "Continue shopping" and "Checkout".

**Checkout** – one page, three visual steps, the order summary always visible (collapsible on mobile).
1. **Your details** – full name, phone with `+260` prefix, live validation and formatting.
2. **Delivery or collection** – segmented control; choosing delivery smoothly reveals the address fields and updates the delivery fee and total.
3. **Review & pay** – line items, fees, total in large type; "Pay securely K750" button; short note that payment is processed by DevDraft.
- Inline errors next to fields; the form keeps its values if the user goes back.
- Price-change and out-of-stock states are explained in plain language with a one-tap fix.

**Order status page** – progress timeline (`Order placed → Payment received → Preparing → Ready / On the way → Completed`), updated live; "Chat with us on WhatsApp" link; works without an account.

**Performance budget (storefront)**
- LCP < 2.5 s on a mid-range Android over 4G; < 100 KB of first-load JS on catalogue pages.
- Images served as AVIF/WebP at 320 / 640 / 1024 / 1600 widths.

### 2.5 Admin UX

**Navigation**
- Desktop: collapsible left sidebar (spec §8 sections, grouped: *Sell* – Dashboard, Orders, Inbox · *Catalogue* – Products, Categories, Stock · *People* – Customers · *Money* – Payments, Reports · *System* – AI Assistant, Integrations, Settings).
- Mobile: bottom tab bar – **Home · Orders · Inbox · Products · More** – with unread/attention badges.
- Top bar everywhere: WhatsApp connection pill (green/amber/red), **global AI switch** (Auto / Suggest / Off, very visible), notifications, ⌘K command palette (jump to any order, product, customer or setting).

**Dashboard**
- "Needs attention" card first: AI drafts waiting for approval, escalated conversations, flagged orders (e.g. late payments), low stock, WhatsApp disconnected.
- KPI cards: paid sales, orders, average order value, conversion of WhatsApp chats to orders – each with change vs the previous period.
- Sales chart with channel split (Website vs WhatsApp), best sellers, recent orders.
- Period switcher: Today · This week · This month · Custom.

**Products**
- Grid/table toggle; inline stock edit; status chips; filters as chips.
- **Snap to sell:** a big "+ Snap product" button opens the camera on mobile (`capture="environment"`) or a dropzone on desktop. The owner takes a photo and optionally records a voice note ("blue chitenge, K60, 5 pieces"). The AI fills in name, description, price and stock as **suggested values** (violet AI highlight) for the owner to accept or edit.
- Drag to reorder images; set cover image.

**Orders**
- Table with status, payment and channel chips; saved filter views; bulk status updates.
- Order detail as a drawer with a vertical timeline (created → link sent → paid → dispatched), customer card, items, payment and webhook history, and a "View conversation" link for WhatsApp orders.
- Fulfilment actions as clear buttons that show only the allowed next steps.

**WhatsApp inbox** – modelled on modern chat apps.
```text
Desktop (3 panels)
┌──────────────┬───────────────────────────────┬──────────────┐
│ 🔍 Search     │ Mwila B.  +260 97…   [AI Auto▾]│ Mwila B.     │
│ All·Unread·AI │                [Take over]    │ +260 97…     │
│──────────────│  ┌──────────────┐              │ Woodlands    │
│● Mwila B.  2m│  │ do you have… │ customer     │──────────────│
│  🤖 Sure, we…│  └──────────────┘              │ Draft order  │
│  Chanda K. 1h│        ┌───────────────────┐   │ 2× Headphones│
│  👤 Thanks!  │  AI ✦  │ Yes! K350 each…   │   │ Total K750   │
│              │        └───────────────────┘   │──────────────│
│              │ ┌ AI draft ─────────────────┐  │ Past orders  │
│              │ │ "Would you like delivery…"│  │ ORD-00102 ✓  │
│              │ │ [Approve] [Edit] [Discard]│  │              │
│              │ └───────────────────────────┘  │              │
│              │ [ / Type a reply…        ➤ ]  │              │
└──────────────┴───────────────────────────────┴──────────────┘
```
- On mobile the three panels become three screens (list → chat → customer sheet).
- Bubbles distinguish **customer**, **AI** (violet tint + ✦ icon) and **owner**; delivery ticks; failed messages show a retry button.
- Voice notes: compact player with waveform, plus "AI heard: …" summary under it. Images open in a lightbox.
- AI drafts appear above the composer with **Approve / Edit / Discard**.
- **Take over** is one large button; the mode control shows the current state and any timeout ("Human until 14:30" / "Human – indefinitely").
- Composer: `/` opens quick inserts – preset responses, product cards (photo + price), "send order summary".
- Keyboard shortcuts on desktop: `j`/`k` next/previous conversation, `r` reply, `t` take over, `a` approve draft.

**AI Assistant settings**
- Settings in grouped cards (Behaviour, Permissions, Media, Hours & language, Escalation, Presets), each with a one-line plain-language explanation.
- **Test sandbox** next to the settings: chat with the assistant using the live catalogue and current settings, without WhatsApp, showing the tool calls it made.
- Activity log as an expandable timeline: message → what the AI understood → tools called → reply → sent / suggested / dropped.

**Integrations** – WhatsApp card with large QR code, step-by-step linking instructions, connection status and number, Reconnect / Disconnect; DevDraft card with a connection test and webhook status; Resend card with a "send test email" button.

**Feedback and states**
- Skeleton loaders for every list; optimistic updates for stock edits and status changes, with undo in the toast.
- Designed empty states with a clear first action ("No products yet – Snap your first product").
- Real-time updates arrive with a subtle highlight, not a full refresh.
- Browser notifications for new messages, escalations and paid orders (with permission). The admin can be installed as a **PWA** on the owner's phone home screen.

### 2.6 Accessibility & quality bar
- WCAG 2.2 AA: contrast, visible focus rings, full keyboard navigation, labelled controls, 44 × 44 px touch targets.
- Status never shown by colour alone.
- `prefers-reduced-motion` respected; animations ≤ 200 ms.
- All UI copy kept in message files so it's ready for more languages later.
- **Visual regression tests:** Playwright screenshots of key screens at 390 px and 1440 px, light and dark.
- Lighthouse CI on storefront pages: Performance ≥ 90, Accessibility ≥ 95.

---

## 3. Phase 0 – Checks and Provider Confirmation (alongside Phase 1)

Each produces a short note in `infra/deploy/spikes/` and, where applicable, updates the design decisions.

### 0.1 DevDraft (closes spec §7.5)
- [ ] Obtain sandbox and production credentials.
- [ ] Confirm production base URL (prototype assumes `https://api.devdraft.ai/api/v0`; docs reference different hosts).
- [ ] Create a one-time link; record the **exact response schema**, especially the customer-facing URL field and link ID.
- [ ] Confirm allowed `linkType`, `recurringType`, `currency` values. **Confirm whether ZMW is supported** – if not, decide currency with the owner (spec §15 Q5).
- [ ] Register a webhook; capture real `payment.completed` / `payment.failed` payloads. Confirm signature header, algorithm, encoding, timestamp/replay protection, retry schedule.
- [ ] Confirm whether a payment/link status query endpoint exists (needed for reconciliation).
- [ ] Confirm fees, settlement currency, refunds, limits.
- **Output:** `devdraft.md` with real request/response fixtures saved to `apps/api/test/fixtures/devdraft/`.

### 0.2 whatsapp-web.js
- [ ] Owner decision on the number (personal / Business app / dedicated) and written acceptance of the unofficial-integration risk (spec §4.1, §15 Q1).
- [ ] Confirm the current `whatsapp-web.js` version works with current WhatsApp Web; `LocalAuth` survives a container restart on a persistent volume without re-scan.
- [ ] Verify media download for voice notes (`audio/ogg; codecs=opus`), images, documents; measure sizes.
- [ ] Measure Chromium memory/CPU on the target server (sizes the server).

### 0.3 Gemini
- [ ] Pick a current model that supports function calling + audio + image input (verify live docs; `.env.example` currently says `gemini-2.5-flash`). Record model ID, limits and pricing.
- [ ] Verify OGG/Opus voice notes are accepted directly; if not, add an `ffmpeg` transcode step (bundled in the API image).
- [ ] Decide inline data vs Files API threshold by payload size.
- [ ] Test the launch languages (spec §15 Q4 – prototype assumes English, Bemba, Nyanja).

### 0.4 Resend
- [ ] Create a Resend account; verify the sending domain (SPF/DKIM DNS records).
- [ ] Confirm the from-address and that test emails arrive (not in spam).

### 0.5 Owner configuration answers (spec §15)
- [ ] Delivery pricing model (flat / by area / manual). Default: flat fee + free collection.
- [ ] Payment links: AI auto-send after confirmation, or owner approval during rollout. Default: owner approval for the first 2 weeks.
- [ ] Launch languages and currency.
- [ ] Brand basics: shop name, logo, primary colour (defaults to the §2.3 palette).

---

## 4. Phase 1 – Foundation, Database, Design System and Admin Auth

### Status: ✅ complete (2026-10-31)

Delivered as planned, with these changes (recorded so later phases build on what exists):

| Planned | Built | Why / follow-up |
|---|---|---|
| Prisma | Drizzle ORM + `better-sqlite3` | D18. |
| Double-submit CSRF cookie + Origin check | Nest 12 Fetch-Metadata check + per-session CSRF token | D19. |
| React Email templates | Plain HTML + text templates in `apps/api/src/email/templates.ts` | No extra dependency for two emails; revisit if templates multiply. |
| Rotating log files | pino to `data/logs/api.log` in production, pretty console in dev | Rotation by the host (`logrotate` with `copytruncate`) – Phase 8 runbook. |
| Phone/message-body log redaction | Secrets, cookies, passwords and tokens redacted | Phone and message redaction rules added with the WhatsApp data in Phase 5. |
| Dev seed of sample categories/products | Owner account only | Sample catalogue seed lands with the catalogue in Phase 2. |
| Select, Chip, Table, PhoneInput components | Not yet built | Built in Phases 2–3 where first used. Added beyond plan: Alert, Field (accessible label/hint/error), PasswordInput, SegmentedControl, ProgressRing, Logo, Kbd. |
| CI e2e smoke | Full Playwright e2e in CI; pixel comparisons only locally | Baselines are recorded on macOS; Linux font rendering differs. Record Linux baselines (or run in a pinned container) if CI pixel checks are wanted. |

Test coverage at completion: 33 API tests (auth, lockout, reset, CSRF, default-deny route sweep, job queue, file store, signed URLs), 4 database tests (CHECKs, FTS5 triggers), 5 shared tests (money, phone), 17 Playwright e2e/visual tests across desktop light/dark and mobile.

### Tasks
**Repo & tooling**
- [x] Move prototype to `legacy/`; scaffold monorepo (pnpm, Turborepo, TypeScript strict, ESLint, Prettier).
- [x] `pnpm dev` starts web and api; the SQLite file and upload folders are created under `./data` automatically. (`pnpm setup` writes `.env` with generated secrets.)
- [x] CI (GitHub Actions): install, lint, build, typecheck, unit/integration tests (temp SQLite per test), Playwright e2e.
- [x] Config module with zod-validated env; the app refuses to boot on missing/invalid secrets.
- [x] Structured logging (pino) with redaction – see status table for rotation and phone redaction.

**Database (`packages/db`)** – full schema now, so later phases only add columns. SQLite types: `INTEGER` for money/counters, `TEXT` for enums (with `CHECK`), JSON as text, timestamps as ISO/UTC.

| Table | Key columns / constraints |
|---|---|
| `users` | `id`, `email` UNIQUE, `password_hash` (argon2id), `role` (`OWNER`), `failed_logins`, `locked_until`, timestamps |
| `sessions` | `id` (random 256-bit, stored hashed), `user_id`, `expires_at`, `last_seen_at`, `ip`, `user_agent` |
| `password_reset_tokens` | `token_hash`, `user_id`, `expires_at`, `used_at` |
| `rate_limits` | `key`, `window_start`, `count` (login and public endpoint limits that survive restarts) |
| `categories` | `id`, `name`, `slug` UNIQUE, `sort_order`, `archived_at` |
| `products` | `id` (cuid), `name`, `slug` UNIQUE, `description`, `category_id`, `status` (`ACTIVE·INACTIVE·UNAVAILABLE·ARCHIVED`), timestamps |
| `products_fts` | FTS5 virtual table over name, description, SKUs, category name; kept in sync by triggers |
| `product_variants` | `id`, `product_id`, `sku` UNIQUE, `option_values` JSON, `price_minor`, `compare_at_minor`, `currency`, `is_default` |
| `product_images` | `id`, `product_id`, `file_key`, `alt`, `sort_order`, `width`, `height`, `blur_data_url` |
| `inventory` | `variant_id` PK, `on_hand` CHECK ≥ 0, `reserved` CHECK ≥ 0, CHECK `reserved <= on_hand`, `low_stock_threshold` |
| `stock_movements` | `id`, `variant_id`, `delta_on_hand`, `delta_reserved`, `reason` (`MANUAL_ADJUST·RESERVE·RELEASE·SALE·RETURN·CORRECTION`), `note`, `order_id?`, `user_id?`, `created_at`; UNIQUE(`order_id`,`variant_id`,`reason`) where `order_id` is set |
| `customers` | `id`, `full_name`, `phone_e164` UNIQUE, `whatsapp_id?` UNIQUE, `default_address` JSON? |
| `orders` | `id`, `ref` UNIQUE (`ORD-00001`, from a counter row), `channel` (`WEBSITE·WHATSAPP`), `customer_id`, `status`, `payment_status`, `fulfilment_status` (D3), `fulfilment_method` (`DELIVERY·COLLECTION`), `delivery_address` JSON?, `subtotal_minor`, `delivery_fee_minor`, `discount_minor`, `total_minor`, `currency`, `reservation_expires_at`, `conversation_id?`, `quote_id?`, `status_token`, `idempotency_key` UNIQUE, `needs_attention`, timestamps |
| `order_items` | `order_id`, `variant_id`, `product_name_snapshot`, `variant_label_snapshot`, `sku_snapshot`, `unit_price_minor`, `quantity`, `line_total_minor` |
| `quotes` | `id`, `conversation_id?`, `items` JSON, `fees` JSON, `total_minor`, `hash`, `presented_message_id?`, `expires_at`, `consumed_at` (D7) |
| `payments` | `id`, `order_id`, `provider` (`DEVDRAFT`), `provider_link_id` UNIQUE, `provider_payment_id` UNIQUE, `payment_url`, `amount_minor`, `currency`, `status`, `idempotency_key` UNIQUE, `raw_response` JSON, timestamps |
| `webhook_events` | `id`, `provider`, `provider_event_id`, UNIQUE(`provider`,`provider_event_id`), `type`, `signature_valid`, `payload` JSON, `status` (`RECEIVED·PROCESSED·IGNORED·FAILED`), `outcome`, `attempts`, timestamps |
| `conversations` | `id`, `customer_id`, `channel_address` UNIQUE (WhatsApp ID), `last_message_at`, `unread_count`, `summary`, `context` JSON (product refs, pending question, known details with provenance) |
| `messages` | `id`, `conversation_id`, `provider_message_id` UNIQUE, `direction` (`IN·OUT`), `author` (`CUSTOMER·AI·OWNER·SYSTEM`), `type` (`TEXT·IMAGE·AUDIO·DOCUMENT·OTHER`), `body`, `media` JSON (mime, size, file_key, expires_at), `delivery_state`, `ai_draft_status` (`NONE·DRAFT·APPROVED·REJECTED`), timestamps |
| `conversation_controls` | `conversation_id` PK, `mode` (`AI_AUTO·AI_SUGGEST·HUMAN·PAUSED`), `generation` INTEGER (D8), `takeover_until?` (NULL = indefinite), `changed_by`, `changed_at` |
| `ai_settings` | singleton: master switch, global mode, style, tone, language, feature toggles (§5.3), confidence threshold, escalation topics, after-hours message, takeover timeout default, per-order limit |
| `preset_responses` | `key` (`greeting·hours·location·delivery·payment·…`), `text`, `enabled` |
| `business_settings` | singleton: name, logo file, brand colour, address, hours JSON, delivery mode/fee, collection enabled, reservation TTL, draft TTL, media retention days, currency |
| `ai_activity_logs` | `id`, `conversation_id`, `message_id`, `input_types`, `interpretation`, `tool_calls` JSON, `response`, `outcome` (`SUGGESTED·APPROVED·AUTO_SENT·DROPPED·ESCALATED·ERROR`), `model`, `latency_ms`, `tokens` |
| `audit_logs` | `id`, `actor` (`OWNER·SYSTEM·AI`), `action`, `entity`, `entity_id`, `before`/`after` JSON, `created_at` |
| `integrations` | `kind` (`WHATSAPP·DEVDRAFT·RESEND`), `status`, `metadata` JSON (connected number, last error) – **never** session credentials |
| `jobs` | `id`, `queue`, `dedupe_key` UNIQUE?, `group_key?`, `payload` JSON, `run_at`, `status` (`QUEUED·RUNNING·DONE·FAILED·CANCELLED`), `attempts`, `max_attempts`, `locked_until`, `last_error`, timestamps (D17) |
| `email_log` | `id`, `to`, `template`, `provider_id`, `status`, `error`, `created_at` |

- [x] Drizzle schema (all tables above) with `CHECK` constraints + custom SQL migration for the FTS5 table, sync triggers and singleton settings rows.
- [x] On connect: set `journal_mode=WAL`, `busy_timeout=5000`, `foreign_keys=ON`, `synchronous=NORMAL`. Migrations run on API start.
- [x] Owner created on first boot from `OWNER_EMAIL` / `OWNER_INITIAL_PASSWORD` (sample catalogue → Phase 2).

**Core services**
- [x] **JobQueue** (D17): `enqueue(queue, payload, {dedupeKey, groupKey, runAt, maxAttempts})`, worker loop claiming jobs with an atomic `UPDATE … WHERE status='QUEUED' AND run_at<=now … RETURNING`, exponential backoff, one running job per `group_key`, stale-lock recovery on startup, `cancel(groupKey, queue)`. Recurring schedules via a small in-process scheduler that enqueues with dedupe keys (e.g. `expire:2026-10-31T10:05`).
- [x] **FileStore** (D16): `savePublic` / `savePrivate` (stream to temp → sniff type with `file-type` → enforce size/type allowlist → move to `/{yyyy}/{mm}/{random}.{ext}`), `signedUrl(fileKey, ttl)` using HMAC, `delete`, path-traversal-proof key validation. Disk usage reported to the dashboard.
- [x] **EmailProvider** – `ResendEmailProvider` (official `resend` SDK, job ID as idempotency key) + `LogEmailProvider` for dev/test that writes emails to `data/logs/emails`. Sent via the `email.send` job queue. Templates: password reset, password changed.

**Admin auth (`apps/api/src/auth`)**
- [x] Login: argon2id verify, constant-time failure path, per-IP and per-account rate limits (SQLite `rate_limits`), lockout after N failures.
- [x] Session: opaque ID in `HttpOnly; Secure; SameSite=Lax` cookie, sliding expiry (12 h idle / 7 d absolute), server-side revocation, logout.
- [x] CSRF protection for cookie-authenticated mutations (D19).
- [x] Global `AuthGuard` default-deny; public routes opt out explicitly with `@Public()`.
- [x] Password reset via Resend (30 min, single use) + CLI break-glass `pnpm reset-owner-password` (D11). Change password in Settings signs out other devices.

**Design system & web shell (`packages/ui`, `apps/web`)**
- [x] Tokens (§2.3), Tailwind v4, light/dark themes, Geist fonts (self-hosted), base components – see status table.
- [x] Admin shell: collapsible sidebar (desktop) / bottom tabs + More drawer (mobile), top bar with WhatsApp/AI status pills, ⌘K command menu, dashboard with setup checklist, System and Integrations pages with live data, Settings (password, appearance), placeholders for later sections, PWA manifest.
- [x] Login, forgot-password and reset pages – polished, branded, mobile-first.
- [x] Storefront shell: header, footer, cart (bottom sheet on phones, side sheet on desktop), "opening soon" home.
- [x] Playwright visual-regression setup (390 px / 1440 px, light/dark).

### Definition of done
- `pnpm dev` runs everything locally with zero external services except optional Resend.
- Owner can log in, stay logged in, log out; lockout and reset email work.
- Every `/admin/*` API returns 401 without a session (an automated test enumerates all routes).
- Job queue tests: dedupe, retry/backoff, group serialisation, crash recovery.

**Closes:** "Owner can log in securely."

---

## 5. Phase 2 – Catalogue and Inventory

### Status: ✅ complete (2026-10-31)

| Planned | Built | Why / follow-up |
|---|---|---|
| `stock.changed` Socket.IO event | In-process `EventBus` emits `stock.changed` / `catalog.changed`; the admin refreshes via TanStack Query invalidation | Socket.IO arrives with the inbox in Phase 5 and will forward these events. |
| `reserve(orderId, items)` | `reserveOrder / releaseOrder / commitOrderSale(orderId)` read the order's `order_items` | One source of truth for quantities. `commitOrderSale` also covers the Phase 4 late-payment case: if the reservation was released, it takes stock from what's available, or reports a shortage. |
| Drag-to-reorder photos | Make cover / move earlier / move later menu; drag-and-drop for adding files | Works the same with touch and keyboard; HTML drag-and-drop doesn't work on phones. |
| – | Schema: `products.option_names`, `product_images.widths` (migration `0002`) | Needed for variant labels and responsive image sets. |
| – | Gemini model `gemini-3.8-flash` (verified 2026-10-31: stable; image + audio input incl. `audio/webm`; JSON-schema output). Safari voice notes (`audio/mp4`) are sent as `audio/m4a`. | Phase 0.3 item answered. |
| – | `pnpm seed` – sample catalogue (8 products, 4 categories, generated photos) through the real services | Deferred from Phase 1. |
| – | ESLint `react-hooks` rules | Catches hook dependency bugs in the admin. |

Test coverage added: 20 API tests (category/product CRUD and rules, FTS search and filters, image renditions with EXIF/GPS stripping, stock API and history, Snap with a mocked model, and the full order stock lifecycle incl. a 5-connection / 50-reservation concurrency test), 8 shared schema tests, 1 Playwright journey (category → product with photo → price change → stock adjustment → search → history).

### Tasks
- [x] Categories CRUD + archive, reorder, delete only when unused.
- [x] Products CRUD, archive (soft; restore comes back hidden), hard delete only if never ordered.
- [x] Variants editor (up to 3 options); default variant auto-created; SKUs generated when blank; variants with orders can't be removed.
- [x] Image upload: multipart to the API → `FileStore.savePublic` → `sharp` generates AVIF/WebP at 320/640/1024/1600 + blur placeholder; strip EXIF/GPS. Served from `/media/...` with immutable cache headers (Caddy serves the public folder directly).
- [x] **Snap to sell** (§2.5): photo + voice note + typed note → suggested name, description, price, starting stock and category, highlighted in violet until edited.
- [x] Admin product list: grid/table toggle, search, filters, inline stock edit, pagination.
- [x] **InventoryService** – the only code path that changes stock:
  - `adjust(variantId, delta, reason, note, userId)` – manual adjustment, reason required.
  - `reserve(orderId, items)` – one transaction; per item `UPDATE inventory SET reserved = reserved + :q WHERE variant_id = :v AND on_hand - reserved >= :q`; if any update affects 0 rows, roll back the whole transaction.
  - `release(orderId)` – idempotent (unique movement row per order/variant/reason).
  - `commitSale(orderId)` – `on_hand -= q, reserved -= q`; idempotent via the same unique constraint.
  - Every call writes `stock_movements` in the same transaction.
- [x] Stock page with history per variant and alert levels; low-stock widget on the dashboard.
- [x] `stock.changed` event (in-process; Socket.IO in Phase 5).

### Tests
- Unit: price/compare-at validation, slug uniqueness, file type sniffing rejects a renamed `.exe`.
- **Concurrency test:** 50 parallel reservations for a variant with stock 10 → exactly 10 succeed, `reserved = 10`, never negative (also with `SQLITE_BUSY` retries exercised).
- Idempotency: calling `commitSale` / `release` twice changes stock once.

### Definition of done
Owner can manage the full catalogue with images on a phone and a laptop; stock can't go negative or be double-counted under concurrent load.

**Closes:** "Owner can create and manage products", "Stock quantities are maintained correctly."

---

## 6. Phase 3 – Storefront, Cart and Checkout

### Tasks
- [ ] Storefront pages per §2.4 (server-rendered with revalidation): home, category, product detail, search.
- [ ] Cart: client-side (localStorage) holding only `variantId + quantity`; `POST /cart/price` returns trusted lines, totals and availability.
- [ ] Checkout per §2.4: name, phone (D12), delivery vs collection, address only for delivery.
- [ ] **`OrderService.createFromCheckout`** (shared with WhatsApp in Phase 7):
  1. Re-price every line from the DB; ignore any client-sent price/fee/total.
  2. Compute the delivery fee from `business_settings`.
  3. Upsert customer by `phone_e164`.
  4. In one transaction: insert order + items with snapshots, `reserve()` stock, set `reservation_expires_at`.
  5. Idempotent on a client-generated checkout key (double-tap safe).
- [ ] Review step before payment; "Pay securely" calls Phase 4 link creation and redirects.
- [ ] Order status page (`/order/[ref]?t=<status_token>`) with live timeline.
- [ ] Privacy notice page (spec §11) linked from checkout and the WhatsApp greeting.
- [ ] Rate limits on public endpoints.
- [ ] Lighthouse CI on catalogue, product and checkout pages.

### Tests
- Tampered client totals are ignored (modify request body price → server total unchanged).
- Out-of-stock item blocks checkout with a clear message.
- Playwright e2e on mobile and desktop: browse → cart → checkout (collection and delivery paths).

### Definition of done
A customer can place a website order without an account in under a minute on a phone; address is required only for delivery; performance budget met.

**Closes:** "Public customers can browse and order without accounts", "Checkout requires name and phone number", "Address is collected when needed", "Website orders are recorded correctly."

---

## 7. Phase 4 – Orders, DevDraft Payments and Webhooks

### Tasks
**PaymentProvider (`apps/api/src/payments`)**
- [ ] `DevDraftProvider.createPaymentLink(order)` using Phase 0 confirmed fields: one-time link, exact backend total, order ref in title/description, return URL to the order status page.
- [ ] Idempotency: `payments.idempotency_key` generated once per order attempt and reused on retry.
- [ ] Persist `raw_response`, `provider_link_id`, `payment_url`; set `payment_status = LINK_CREATED`. Fail loudly if the confirmed URL field is missing – no guessing.
- [ ] Guard: links only for `PENDING_PAYMENT` orders with a live reservation and a total within the per-order limit.

**Webhook endpoint `POST /webhooks/devdraft`**
- [ ] NestJS `rawBody: true`; verify the signature over the raw bytes per the confirmed algorithm; constant-time compare; reject stale timestamps if supported.
- [ ] Insert the `webhook_events` row (unique provider event ID) **before** processing; respond 2xx quickly; enqueue a `payments.webhook` job with `dedupeKey = provider_event_id`.
- [ ] Processor (one transaction):
  - Match by `provider_link_id` / `provider_payment_id` stored on `payments`; verify amount and currency equal the order's.
  - `payment.completed` → `payment_status = PAID`, `status = CONFIRMED`, `commitSale()`, `fulfilment_status = PROCESSING`. The status change uses `UPDATE … WHERE payment_status != 'PAID'` so only one processor can win.
  - `payment.failed` → `payment_status = FAILED`; keep the reservation until expiry so the customer can retry.
  - Duplicate / unknown / mismatched → `IGNORED` with outcome; permanent errors are not retried.
- [ ] **Late payment:** payment after the reservation expired → try to re-reserve; if stock is gone, mark `PAID` + `needs_attention` for an owner refund/backorder decision. Never silently drop.
- [ ] **Reconciliation job** (every 10 min, if a status API exists) for orders in `LINK_CREATED` older than N minutes.
- [ ] **Expiry job** (every minute): expire unpaid orders past `reservation_expires_at` → `release()`, `status = EXPIRED`; expire stale drafts/quotes.
- [ ] Notifications: owner (dashboard, browser notification, optional email via Resend, optional WhatsApp) and customer (WhatsApp for WhatsApp orders; status page for web).

**Admin orders & payments UI** (per §2.5)
- [ ] Orders table with filters, saved views, detail drawer with timeline, fulfilment actions showing only allowed transitions, cancel rules (unpaid → cancel + release; paid → cancel requires a refund note).
- [ ] Payments page: payment records, provider refs, webhook events with outcomes.

### Tests
- Signature: valid, invalid, missing header, tampered body (Phase 0 fixtures).
- Replay the same `payment.completed` 5× concurrently → one stock deduction, one notification.
- Amount mismatch → ignored and flagged.
- Expiry releases stock; late-payment path flags the order.

### Definition of done
Website orders are paid end-to-end against DevDraft sandbox; only verified webhooks mark orders paid.

**Closes:** "Payment link is generated through the documented DevDraft API", "Actual payment URL is sent", "Payment is confirmed only through a verified provider notification", "Duplicate payment notifications do not duplicate stock deductions."

---

## 8. Phase 5 – WhatsApp Service, Inbox and Manual Replies

### Tasks
**`apps/whatsapp` service**
- [ ] `whatsapp-web.js` client with `LocalAuth({ dataPath: /data/wwebjs })` on a persistent, permission-restricted volume (`.gitignore` already covers `.wwebjs_auth/`).
- [ ] Lifecycle events (`qr`, `authenticated`, `ready`, `auth_failure`, `disconnected`, `change_state`) → API `/internal/wa/events`. Auto-reconnect with backoff; health endpoint; watchdog restarts Chromium on hang.
- [ ] Inbound: on `message` → normalise (sender → E.164, type, body/caption, quoted message ID, timestamp) → download media and stream it to the API's internal upload endpoint (stored with `FileStore.savePrivate`) → post the event with `provider_message_id`.
- [ ] **Local durable buffer** (D9): inbound events and outbound acks are appended to an on-disk journal and only removed after the API acknowledges, so an API restart loses nothing.
- [ ] Outbound: API calls `/internal/send` on the WhatsApp service; it sends, then reports `message_ack` updates (sent/delivered/read/error) back.
- [ ] Outbound rate limit and small human-like delays (reduces restriction risk).
- [ ] Commands: `logout`, `restart`, `qr`.
- [ ] Implements `MessagingProvider`; the API never imports `whatsapp-web.js`.

**API side**
- [ ] Inbound handler: insert message (unique `provider_message_id`; conflict = drop), upsert customer + conversation, increment unread, emit `message.new`, enqueue `ai.respond` (no-op until Phase 6).
- [ ] Outbound: `wa.outbound` jobs (retry with backoff; final failure marks the message `ERROR` with a retry button in the inbox).
- [ ] Internal endpoints: HMAC (shared secret + timestamp), bound to localhost / private Docker network only.
- [ ] `ConversationControlService`: `setMode`, `takeover(indefinite | until)`, `release`; increments `generation` (D8) and cancels queued `ai.respond` jobs for the group; writes the audit log; emits `conversation.updated`.
- [ ] Takeover timeout job: only releases if `takeover_until` is set and has passed (an indefinite takeover never auto-releases, spec §4.4).

**Admin UI** (per §2.5)
- [ ] Integrations → WhatsApp card: live QR via Socket.IO (never stored), status, number, reconnect/disconnect, last error, risk acknowledgement gate.
- [ ] Inbox: three panels on desktop / three screens on mobile, media previews via signed URLs, delivery ticks, composer with `/` quick inserts, takeover controls, customer & order panel, keyboard shortcuts.
- [ ] Owner reply → `wa.outbound`; stored with `author = OWNER`; sending as owner sets `HUMAN` (configurable).
- [ ] Browser notifications + PWA manifest for the admin.

### Tests
- Same inbound message delivered twice → one row, one AI job.
- API restart while messages arrive → all messages appear after restart (journal replay).
- WhatsApp service restart → reconnects without QR (scripted on staging where possible).
- Socket.IO e2e: inbound message appears in an open inbox within 2 s.

### Definition of done
Owner links the number, sees live conversations and replies from the dashboard on phone and desktop.

**Closes:** "Owner can connect the intended WhatsApp account", "The service can receive and send supported messages", "Conversations appear in the admin inbox", "Owner can reply from the dashboard."

---

## 9. Phase 6 – Gemini Integration, Multimodal Understanding and Context

### Tasks
**AI module (`apps/api/src/ai`)**
- [ ] `GeminiProvider` over the official `@google/genai` SDK: model from config, timeouts, retries with jitter, token/latency metrics, safety settings.
- [ ] **Context builder** – one request per turn:
  1. System instruction: business identity, rules from §5.6, style/tone/language from `ai_settings`, current business-hours state.
  2. Rolling conversation `summary` + last N messages (bounded by a token budget, default ~6k tokens).
  3. Structured state block: known customer details **with provenance** (`customer_said` / `database` / `ai_inferred`), product references (IDs), current draft/quote, pending question.
  4. Current turn: text, caption and media parts.
- [ ] **Media pipeline:** read from the private upload folder → check against the model's supported types → transcode audio with `ffmpeg` only if Phase 0 requires it → inline or Files API by size → delete temp copies; `media.cleanup` job deletes originals per `media_retention_days` (default: after processing).
- [ ] **Read-only tools** (zod-validated args; results contain IDs, never raw rows):
  - `search_products(query, category?, limit)` – FTS5 with prefix matching; returns `product_id`, name, price, availability band.
  - `get_product_details(product_id)`, `get_product_variants(product_id)`
  - `check_stock(variant_id, quantity)` – `available: bool`; exact count only if the owner allows it.
  - `get_business_policy(topic)` – preset/policy text.
  - `get_order_status(order_ref)` – only this conversation's customer's orders.
  - `handover_to_owner(reason, summary)`
  - Images: the model describes the image, then calls `search_products`; it must express uncertainty and ask for confirmation unless the match is strong (spec §5.4).
- [ ] **Turn processor (`ai.respond` job, `group_key = conversation_id`):**
  - Debounce: enqueue with `runAt = now + 3 s` and a dedupe key per conversation so bursts (text + photo + voice note) are processed as one turn.
  - Capture `generation` at start; tool loop (max 6 steps); produce `{ reply, interpretation, confidence, escalate? }`.
  - Write an `ai_activity_logs` row for every turn, including dropped ones.
- [ ] **Sending gate** (single function for every AI send): master switch on ∧ mode = `AI_AUTO` (or `AI_SUGGEST` → save as a draft) ∧ `generation` unchanged ∧ within hours (or after-hours preset) ∧ not a duplicate of the last outgoing message → enqueue `wa.outbound`; otherwise drop and log.
- [ ] Suggestion mode in the inbox: draft card with Approve / Edit / Discard.
- [ ] Response styles: preset responses sent verbatim when the intent matches a preset; concise/conversational/structured via system-instruction variants.
- [ ] Context maintenance: update `conversations.context` after each turn; re-summarise when history exceeds the budget, keeping order details and unresolved questions.
- [ ] AI settings page + **test sandbox** + activity log viewer (§2.5); per-conversation mode override.

### Evaluation harness (required)
- [ ] `apps/api/test/ai-evals/` – scripted conversations with a fixture catalogue and fixture media (voice notes, product photos, screenshots), run against the real model nightly and on demand.
- [ ] Assertions on tool calls and invariants, not exact text: "called `check_stock` before stating availability", "never states a price not in tool results", "asks a clarifying question when two products match", "doesn't re-ask the name once given", "resolves 'the smaller ones' to the variant discussed earlier".
- [ ] Pass rate tracked per model/prompt version; a regression blocks a prompt change.

### Definition of done
In `AI_SUGGEST` mode the assistant drafts correct, grounded answers for text, voice-note and image enquiries with conversation context; eval suite ≥ 90 % pass.

**Closes:** "AI can answer product questions using live catalogue data", "check stock", "interpret voice notes", "interpret images and captions", "combine media, text and history", "maintains context", "follows the configured response style", "asks for clarification when uncertain."

---

## 10. Phase 7 – Guard Rules, Takeover and Automated Order Workflow

### Tasks
**Order tools (write tools – the backend enforces every rule)**
- [ ] `create_draft_order` / `update_draft_order(items[{variant_id, quantity}], fulfilment_method?, address?, customer_name?)` – `orders.status = DRAFT` tied to the conversation; customer details accepted only with provenance `customer_said`.
- [ ] `calculate_order(draft_id)` – backend prices, fees, total; creates a **quote** (D7) and returns the **backend-rendered** summary (D6, D13). The sending gate verifies the summary block is sent unchanged.
- [ ] `confirm_order(quote_id)` – accepted only if:
  - the quote was sent to the customer (`presented_message_id` set) and is unexpired and unconsumed;
  - the customer's next message is an explicit affirmative (Gemini classification **and** a deterministic check that it contains no changes or questions; ambiguous → ask again);
  - re-validated price and stock still match – otherwise return `changed` plus a new quote for re-approval (spec §6.4).
  Then `OrderService.confirm()`: `PENDING_PAYMENT`, reserve stock, mark the quote consumed – one transaction, idempotent on `quote_id`.
- [ ] `generate_payment_link(order_ref)` – only for this conversation's confirmed order; respects the "auto-send vs owner approval" setting (Phase 0.5). The payment message is a backend template with the exact provider URL.
- [ ] Payment outcome → customer + owner WhatsApp notifications from templates.
- [ ] Escalation rules: configurable topics (complaint, refund, dispute, payment claims, abuse, low confidence) → `handover_to_owner` → `HUMAN` + owner alert.
- [ ] "I've paid" / screenshot handling: reply with `get_order_status`; never asserts payment (spec §5.6).
- [ ] Global AI switch in the admin top bar; per-conversation takeover in the inbox.
- [ ] Per-conversation AI turn limits and a daily Gemini spend alert.

### Guard-rule test matrix (automated)

| Rule (spec §5.6 / §6.4) | Test |
|---|---|
| Never invent price/stock/fees | Eval: every number in a reply appears in a tool result or rendered template. |
| No payment link for an unconfirmed order | `generate_payment_link` on a draft → refused. |
| Can't submit arbitrary totals | Tool schemas accept no price/total fields; extra fields rejected. |
| Confirmation must follow the summary | "yes" before any quote → refused; "yes but make it 3" → not a confirmation. |
| Stock change before confirm | Change stock between quote and "yes" → new quote, re-approval required. |
| Takeover is immediate | Takeover while the model is mid-call → reply dropped (generation mismatch), logged `DROPPED`. |
| Paused / manual never sends | `PAUSED` / `HUMAN` / master off → zero outbound AI messages. |
| No duplicate replies/orders | Duplicate inbound + retries → one reply, one order (quote consumed once). |
| Never marks paid | No tool can change payment status; test asserts it. |
| Doesn't leak internals | Prompts asking for keys/system prompt/other customers → refusal, no leakage. |

### Definition of done
Full WhatsApp order flow (spec §6.2 steps 1–19) works against DevDraft sandbox in `AI_AUTO` on staging with the guard matrix green. Remove `legacy/`.

**Closes:** "Owner takeover stops automated replies", "Message processing does not create duplicate replies or orders", "AI can prepare and confirm orders through the controlled workflow", "Owner can disable or take over AI conversations", "Customer must confirm the order before payment-link creation", "Website and WhatsApp orders use the same stock and order system."

---

## 11. Phase 8 – Reporting, Audit, Security Hardening and Deployment

### Tasks
**Reporting**
- [ ] Dashboard metrics (spec §3.7) per §2.5: paid revenue (`payment_status = PAID` only), order counts by status, paid/unpaid/cancelled, sales by date range, best sellers, stock & low stock, sales by channel. Today / this week / this month / custom; timezone `Africa/Lusaka`.
- [ ] Indexed SQL queries (SQLite is fast enough at single-shop scale); summary table updated on payment events if needed; CSV export.

**Audit & AI log UI**
- [ ] AI activity log viewer (spec §8.2) with filters.
- [ ] Audit log for owner actions, order changes, payment-link creation, takeover/release, settings changes.

**Security & privacy**
- [ ] Threat model review: auth, webhook, internal API, file serving, WhatsApp session, prompt injection via customer messages/images.
- [ ] Prompt-injection hardening: customer content only in user parts, never system; tools enforce authorisation regardless of model output.
- [ ] Dependency and secret scanning in CI; security headers/CSP; CORS locked to the web origin.
- [ ] File serving: private files only via signed, expiring URLs; `Content-Disposition` and `X-Content-Type-Options: nosniff`; no directory listing.
- [ ] Disk permissions: `/data` owned by the app user, `0700` on `db/`, `uploads/private/` and `wwebjs/`. Full-disk encryption on the server volume.
- [ ] Media retention job and log redaction verified.
- [ ] Pen-test checklist: IDOR on order status page and signed URLs, session fixation, CSRF, rate limits, webhook replay, oversized/malformed uploads, path traversal.

**Deployment (single server)**
- [ ] One VPS (size from Phase 0.2 measurements; e.g. 2 vCPU / 4 GB RAM / 80 GB SSD), Docker Compose: `caddy`, `web`, `api` (**single instance** – the only DB writer), `whatsapp` (**single instance**). Shared `/data` volume.
- [ ] Caddy: TLS, HTTP/2/3, gzip/zstd, serves `/media/*` from `uploads/public` directly, proxies the rest.
- [ ] Secrets in a root-only `.env` on the server (or Docker secrets); separate staging and production keys for DevDraft, Gemini and Resend.
- [ ] **Backups:** a job every 6 h runs `VACUUM INTO /data/backups/snapsell-<ts>.db` (consistent while live), plus a tarball of `uploads/public`; keeps 14 days; integrity check (`PRAGMA integrity_check`) on each snapshot. Admin **Settings → Backups** lets the owner download an encrypted backup. Copying backups off the server (e.g. to the owner's computer or another machine via `rsync`) is documented; it is needed to survive losing the server, and nothing ties it to a cloud vendor.
- [ ] **Restore drill** documented and tested: stop api → replace db file → start → verify.
- [ ] Monitoring without external tools: `/health` endpoints, a **System** page in admin (WhatsApp state, job queue backlog/failures, webhook failures, disk space, last backup, Gemini error rate), and alert emails to the owner via Resend for critical conditions (WhatsApp disconnected > 5 min, backup failed, disk > 85 %, webhook signature failures).
- [ ] Runbooks: re-link WhatsApp, rotate keys, stuck payment, restore DB, move to a new server, migrate to the official WhatsApp Business Platform.

### Launch checklist
- [ ] All Phase 0 DevDraft items confirmed; currency decision final (no Kwacha advertised unless confirmed – spec §7.5).
- [ ] Owner has signed off the WhatsApp risk.
- [ ] Two weeks in `AI_SUGGEST` on production with the owner reviewing drafts; switch to `AI_AUTO` only on owner approval (spec §15).
- [ ] Privacy notice live.
- [ ] Visual regression, Lighthouse and accessibility checks green.
- [ ] Off-server backup copy verified at least once.
- [ ] Every item in spec §13 checked off with a linked test or staging evidence.

---

## 12. Cross-Cutting Architecture Notes

### Process layout

```text
                 Internet
                    │
                 [Caddy]  TLS · /media/* static
              ┌─────┴──────┐
          [web: Next.js]   │
              │  REST      │ /api, /webhooks, /socket.io
              └──────▶ [api: NestJS] ── SQLite (/data/db)  ── /data/uploads
                         │  ▲   job worker · scheduler · Socket.IO
           internal HTTP │  │ internal HTTP (HMAC, localhost)
                         ▼  │
                    [whatsapp service] ── /data/wwebjs, journal
                         │
                    WhatsApp Web
api ──▶ Gemini · DevDraft · Resend      (the only outbound services)
```

### Jobs (SQLite queue)

| Queue | Trigger | Dedupe / group key | Notes |
|---|---|---|---|
| `ai.respond` | inbound message | dedupe per conversation window; group `conversation_id` | Debounced 3 s; generation-checked; cancelled on takeover. |
| `wa.outbound` | AI or owner send | message ID | Retries with backoff; final failure → `ERROR`. |
| `payments.webhook` | webhook received | `provider_event_id` | Retry-safe processor. |
| `payments.reconcile` | every 10 min | time slot | If DevDraft has a status API. |
| `orders.expire` | every 1 min | time slot | Releases reservations. |
| `conversations.release` | takeover timeout | conversation ID | Only for timed takeovers. |
| `media.cleanup` | hourly | time slot | Retention policy. |
| `backup.snapshot` | every 6 h | time slot | `VACUUM INTO` + integrity check. |
| `email.send` | various | template + entity | Via `EmailProvider` (Resend). |

### Real-time events (Socket.IO, owner-authenticated)
`message.new`, `message.updated`, `conversation.updated`, `order.created`, `order.updated`, `payment.updated`, `stock.changed`, `whatsapp.status`, `ai.draft`, `system.alert`.

### Order state machine

```text
             (WhatsApp)                          (website)
DRAFT ──calculate──▶ PENDING_CONFIRMATION ─┐       │
                                           ├─confirm/checkout─▶ PENDING_PAYMENT ──verified payment──▶ CONFIRMED ──▶ COMPLETED
DRAFT ──ttl──▶ EXPIRED                     │                     │  (reserve stock)                  (commit sale)
                                           │                     ├──ttl──▶ EXPIRED   (release stock)
                                           └─cancel──▶ CANCELLED ◀─cancel─┘          (release stock)

payment_status:    UNPAID → LINK_CREATED → PAID | FAILED (→ LINK_CREATED on retry) → REFUNDED
fulfilment_status: UNFULFILLED → PROCESSING → READY_FOR_COLLECTION | DISPATCHED → DELIVERED
```

### API surface (indicative)
- Public: `GET /products`, `GET /products/:slug`, `GET /categories`, `GET /search`, `POST /cart/price`, `POST /checkout`, `GET /orders/:ref?t=`, `POST /webhooks/devdraft`, `GET /media/*` (Caddy).
- Admin (session): `/admin/auth/*`, `/admin/products`, `/admin/categories`, `/admin/inventory`, `/admin/orders`, `/admin/customers`, `/admin/payments`, `/admin/conversations`, `/admin/ai-settings`, `/admin/ai-sandbox`, `/admin/presets`, `/admin/settings`, `/admin/integrations`, `/admin/reports`, `/admin/logs`, `/admin/system`, `/admin/backups`, `/admin/files/:key` (signed).
- Internal (HMAC, localhost): `/internal/wa/events`, `/internal/wa/media` (API) · `/internal/send`, `/internal/command` (WhatsApp service).

### Environment variables (v1)
`DATA_DIR` (default `./data`), `DATABASE_URL` (`file:${DATA_DIR}/db/snapsell.db`), `SESSION_SECRET`, `FILE_SIGNING_SECRET`, `INTERNAL_HMAC_SECRET`, `BACKUP_ENCRYPTION_KEY`, `PUBLIC_WEB_URL`, `PUBLIC_API_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `DEVDRAFT_BASE_URL`, `DEVDRAFT_CLIENT_KEY`, `DEVDRAFT_CLIENT_SECRET`, `DEVDRAFT_WEBHOOK_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `OWNER_EMAIL`, `OWNER_INITIAL_PASSWORD` (seed only), `WHATSAPP_SERVICE_URL`, `MAX_UPLOAD_MB`, `HARD_ORDER_CAP_MINOR` (non-prod). Currency, link type, delivery fees and branding move from env into `business_settings`.

---

## 13. Testing Strategy Summary

| Layer | Tooling | Focus |
|---|---|---|
| Unit | Vitest | Money math, phone normalisation, state transitions, sending gate, signature verify, file sniffing. |
| Integration | Vitest + temp SQLite file per test file | InventoryService concurrency, OrderService transactions, webhook idempotency, job queue semantics. No containers needed. |
| Contract | Recorded DevDraft fixtures; fake `MessagingProvider`; `LogEmailProvider` | Provider adapters without live calls. |
| E2E | Playwright (mobile + desktop viewports) | Storefront checkout, admin CRUD, inbox real-time, takeover. |
| Visual & a11y | Playwright screenshots, axe-core, Lighthouse CI | §2.6 quality bar. |
| AI evals | Custom harness, real Gemini | Grounding, clarification, context, guard rules. |
| Staging soak | Real WhatsApp test number + DevDraft sandbox | Full §6.2 flow, reconnects, duplicate deliveries, restarts. |

---

## 14. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| WhatsApp number restricted/banned (unofficial library) | Channel down | Dedicated number, conservative send rates, owner risk sign-off, adapter ready for the official Business Platform. |
| whatsapp-web.js breaks after a WhatsApp Web update | Channel down | Pin version, watch upstream releases, disconnection alerts; storefront unaffected. |
| Single server lost (disk failure, provider issue) | Everything down, data at risk | Frequent `VACUUM INTO` snapshots, documented off-server copy, tested restore and "move to new server" runbook. |
| SQLite write contention | Slow requests under bursts | WAL mode, short transactions, single writer process, `busy_timeout` + retry; single-shop load is far below SQLite limits. |
| Disk fills with media/backups | Uploads and writes fail | Media retention job, backup rotation, disk alert at 85 %. |
| DevDraft doesn't support ZMW | Can't sell in Kwacha | Resolve in Phase 0 before pricing copy is final. |
| Webhook missed/delayed | Order stuck unpaid | Reconciliation job + owner "check payment status" button. |
| Resend email lands in spam / is down | Owner can't reset password, misses alerts | Verified domain; CLI break-glass reset; alerts also shown in-app and via browser notifications. |
| Model hallucinates price/availability | Wrong promises | Backend-rendered summaries (D6), grounding evals, suggestion mode during rollout. |
| Race between takeover and AI send | AI talks over the owner | Generation counter compare-and-send (D8). |
| Gemini cost spike / abuse | Cost | Turn limits, debouncing, spend alert, media size caps. |
| Prompt injection via customer text/images | Rule bypass | Tools enforce authz and business rules independently of the model. |

---

## 15. Phase Checklist (summary)

| Phase | Deliverable | Depends on | Exit gate |
|---|---|---|---|
| 0 | Provider checks & owner decisions | – | DevDraft fixtures recorded; model chosen; Resend domain verified; owner answers logged |
| 1 | Monorepo, schema, job queue, file store, design system, admin auth | – | Auth + job-queue tests green; admin shell on mobile & desktop |
| 2 | Catalogue, Snap to sell, inventory | 1 | Concurrency test green |
| 3 | Storefront & checkout | 2 | Checkout e2e green; performance budget met |
| 4 | Orders, payments, webhooks | 3, 0.1 | Sandbox payment end-to-end; duplicate-webhook test green |
| 5 | WhatsApp service & inbox | 1, 0.2 | Live inbox; dedupe + restart tests green |
| 6 | Gemini multimodal + context + AI sandbox | 5, 0.3 | Eval suite ≥ 90 % in suggestion mode |
| 7 | Guard rules & WhatsApp orders | 4, 6 | Guard matrix green; full §6.2 flow on staging |
| 8 | Reports, audit, hardening, backups, deploy | 7 | Launch checklist complete |

Phases 2–4 and Phase 5 can run in parallel after Phase 1 if two developers are available; Phase 7 is the integration point.
