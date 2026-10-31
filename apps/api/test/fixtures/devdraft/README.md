# DevDraft fixtures

Recorded from DevDraft's published guides on 2026-10-31 (spec §7.1). Replace each file with a real
sandbox recording when credentials arrive (BUILD_PLAN Phase 0.1) and re-run `pnpm test`.

| File | Source | Confidence |
| --- | --- | --- |
| `create-payment-link.201.json` | "Create Payment Link" guide, example response, verbatim | Documented. Note: `url` is a **slug**, not a customer-facing URL. |
| `payment-completed.json` | Shape assumed: the guide names `payment.completed` but shows no payload | **Assumed** – confirm field names (`id`, `type`, `data.paymentLinkId`, `data.amount`, `data.currency`). |
| `payment-failed.json` | Same as above for `payment.failed` | **Assumed** |
| `webhook-secret.txt` | Test signing secret (DevDraft secrets match `^[a-zA-Z0-9_-]{32,}$`) | Test value |

Signature (documented): `x-webhook-signature: sha256=<hex HMAC-SHA256 of the raw body with the signing secret>`.

Still to confirm with DevDraft (spec §7.5): production base URL (docs show `https://api.devdraft.com`),
ZMW support (docs list `usdc`, `eurc`), the customer-facing payment URL field, webhook payload fields
and retry policy, and whether a payment status endpoint exists.
