# SnapSell

A single-owner shop with a website and a WhatsApp sales channel, an AI sales assistant, and DevDraft payment
links. Everything runs on one server: SQLite, files on disk, and a built-in job queue. The only outside services are
Gemini, DevDraft, Resend and WhatsApp.

- **Spec:** [`ecommerce_platform_project_plan.md`](ecommerce_platform_project_plan.md)
- **Build plan:** [`BUILD_PLAN.md`](BUILD_PLAN.md) (Phases 1–4 are complete; payments run in test mode until DevDraft is confirmed)
- **Prototype:** [`legacy/`](legacy) (the hackathon version, kept for reference until Phase 7)

## Quick start

Requires Node 22.12+ and pnpm (`corepack enable`).

```bash
pnpm install
pnpm setup            # creates .env with generated secrets and asks for the owner email
pnpm dev              # API on :4000, web on :3000
pnpm seed             # optional: sample catalogue with photos
```

Open <http://localhost:3000/admin> and sign in with the owner email and the initial password that `pnpm setup` printed.
Then remove `OWNER_INITIAL_PASSWORD` from `.env` and change the password under **Settings**.

Forgot the password? On the server: `pnpm reset-owner-password`.

Without `RESEND_API_KEY`, emails (such as password-reset links) are written to `data/logs/emails/`.
Snap to sell needs `GEMINI_API_KEY`; everything else in the catalogue works without it.

## Layout

| Path | What |
| --- | --- |
| `apps/api` | NestJS API: auth, job queue, file store, email, system status |
| `apps/web` | Next.js storefront (`/`) and admin (`/admin`) |
| `packages/db` | Drizzle schema for SQLite, migrations (incl. FTS5 search), `openDatabase()` |
| `packages/shared` | zod schemas, enums, money and phone helpers shared by API and web |
| `packages/ui` | Design tokens and components (Tailwind v4 + Radix) |
| `data/` | Database, uploads, logs and backups (git-ignored; mount as a volume in production) |

## Commands

| Command | Does |
| --- | --- |
| `pnpm dev` | Watch-mode API, web and packages |
| `pnpm build` / `pnpm typecheck` / `pnpm lint` | Across the workspace |
| `pnpm test` | Unit and integration tests (Vitest) |
| `pnpm --filter @snapsell/web test:e2e` | Playwright end-to-end + screenshot tests (builds and starts its own servers on :3100/:4100) |
| `pnpm --filter @snapsell/web test:e2e:update` | Re-record screenshot baselines after an intended UI change |
| `pnpm db:generate` | Create a migration after editing `packages/db/src/schema.ts` |
| `pnpm seed` | Sample catalogue (stationery, cables, chargers, laptops, phones). Skips if products exist; `--force` to add alongside; `--replace` to wipe and reseed |
| `pnpm reset-owner-password` | Break-glass owner password reset (or creates the owner if none exists) |

## How requests flow

In development, Next.js proxies `/api/*` and `/media/*` to the API, so the browser only ever talks to one origin.
In production, Caddy does the same and serves `/media/*` straight from `data/uploads/public`.

Admin security: argon2id passwords, opaque server-side sessions (HttpOnly cookie, 12-hour idle and 7-day absolute
expiry), a per-session CSRF token on every state-changing request plus Nest's Fetch-Metadata cross-origin check,
login rate limits and account lockout. Every API route requires a session unless it is explicitly marked `@Public()`, and
a test enforces that.
