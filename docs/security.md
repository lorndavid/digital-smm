# Security

Security posture of the DigitalSMM platform — what is enforced in code, and what
must be configured externally (documented in [manual-setup](./manual-setup/)).

## Enforced in code

### Transport & headers
- **Helmet** sets security headers on every response (`X-Content-Type-Options`,
  `X-Frame-Options`, `Strict-Transport-Security`, `X-Download-Options`, …).
- `trust proxy = 1` so rate limits and HTTPS detection work behind Nginx/Vercel.

### CORS
- Strict allowlist from `CORS_ORIGINS` (comma-separated, no wildcard). Unknown
  origins get no `Access-Control-Allow-Origin`.

### Body limits
- `express.json({ limit: '1mb' })` — oversized bodies → 413.
- Malformed JSON → 400 (never a 500 or a crash).

### Authentication
- Customer: Google OAuth 2.0 (Authorization Code + **PKCE**) — the `state`
  token is signed (login-CSRF defence), the code_verifier never leaves the SPA.
  Session JWTs are HS256-signed with `CUSTOMER_JWT_SECRET`.
- Admin: email + password (scrypt-hashed in MongoDB) with HS256 JWTs
  (`ADMIN_JWT_SECRET`), roles `admin` / `super_admin`.
- Every sensitive admin action is written to the audit log.

### Authorization
- `/api/admin/*` requires a valid admin JWT (`adminOnly`); role changes require
  `super_admin`. A super admin cannot demote/remove themselves (no lockout).
- Customer routes (`/api/orders`, `/api/payment/*`, `/api/profile`) require a
  customer JWT and enforce ownership (`getOwnedPayment`, per-user order reads).

### Rate limiting
- Global API limiter (`RATE_LIMIT_MAX`), storefront catalogue limiter
  (generous, separate), checkout limiter (120/min), admin-mutation limiter,
  login limiter (20/15min). Redis-backed (`REDIS_URL`) for cross-instance
  enforcement; in-memory fallback otherwise.
- Draft-8 rate-limit headers on limited routes.

### Webhook security
- CutLuy webhooks are **HMAC-SHA256 verified** against the RAW body with
  constant-time comparison + a 5-minute freshness window (replay protection).
  Mounted before `express.json()` so the raw body is available.
- Missing/invalid signature → rejected (fail closed). Unknown payment →
  acknowledged but ignored (CutLuy stops retrying).

### Error handling
- Centralized error middleware: `ApiError` → exact status; Mongoose
  validation/cast/duplicate-key → safe 400/409; everything else → Sentry +
  `500 Internal server error` in production.
- **Never returned to clients:** stack traces, `MONGODB_URI`, JWT secrets,
  payment keys, internal tokens.

### Logging & monitoring
- Structured logs (JSON) carry `requestId`; no request bodies, no
  authorization/cookie headers, no payment secrets.
- Sentry scrubs sensitive headers and drops query strings.

### Analytics privacy
- Frontend events pass a strict whitelist (see [analytics.md](./analytics.md)) —
  tokens, passwords, links and private customer data are stripped by
  construction. Financial events fire only from backend-verified state.

### Payments
- Provider-agnostic `PaymentProvider` interface with signed webhooks and
  idempotent settlement (atomic status claim `pending/scanned → paid`), so
  webhook retries can never double-charge.

## Secret inventory (never commit, never expose to browsers)

| Secret                        | Where                                   |
|-------------------------------|-----------------------------------------|
| `MONGODB_URI`                 | backend env only                        |
| `CUSTOMER_JWT_SECRET` / `ADMIN_JWT_SECRET` | backend env only            |
| `GOOGLE_CLIENT_SECRET`        | backend env only                        |
| `SMMWIZ_API_KEY`              | backend env only                        |
| `CUTLUY_API_KEY` / `CUTLUY_WEBHOOK_SECRET` | backend env only            |
| `ABAPAYWAY_*`                 | backend env only                        |
| Backend `SENTRY_DSN`          | backend env only (read access)          |

Public by design: `VITE_GA_MEASUREMENT_ID`, `VITE_SENTRY_DSN` (frontend) —
the browser must know where to send data.

## External configuration (manual)

- Cloudflare / DNS / SSL — see `docs/manual-setup/01-domain-and-dns.md` and
  `02-cloudflare.md`.
- Vercel deployment env vars — see `docs/manual-setup/03-vercel.md`.
- Google OAuth consent screen publish — README "Google OAuth setup".
- CutLuy webhook endpoint + signing secret — README "Payments".

## Verification commands

```bash
# Headers
curl -sI https://digitalsmm.shop/ | grep -iE "x-content-type|strict-transport|x-frame"

# CORS (should have no allow-origin header)
curl -sI -H "Origin: https://evil.example.com" https://api.digitalsmm.shop/api/health

# No stack traces on errors
curl -s https://api.digitalsmm.shop/api/orders/not-a-real-id | head -c 300
```
