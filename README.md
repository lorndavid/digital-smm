# VidSMM 🇰🇭

**The #1 Cambodia Social Media Marketing Platform.**

A production-ready, monorepo SaaS for buying social media growth — TikTok, Facebook,
Instagram, YouTube and Telegram — with wallet top-ups, **Bakong KHQR payments** (mock for
the MVP) and real-time order tracking via the [smmwiz.com](https://smmwiz.com) API v2.

---

## Architecture

```
root/
├── frontend/   Vue 3 + TypeScript + Vite + TailwindCSS v4 + Pinia + Google OAuth (port 5173)
├── backend/    Node.js + Express 5 + TypeScript + MongoDB Atlas + Mongoose   (port 4000)
└── admin/      Separate Vue 3 admin panel (same stack)                       (port 5174)
```

### Tech stack

| Layer     | Tools |
|-----------|-------|
| Frontend  | Vue 3.5, Vite 8, TypeScript 5.9, TailwindCSS 4, Pinia 3, Vue Router 4, VueUse, Vue Motion (`@vueuse/motion`), Axios, lucide icons |
| Auth      | Google OAuth 2.0 (Authorization Code + PKCE) — customer Google sign-in; custom HS256 session JWTs; separate MongoDB email + password auth for admins |
| Backend   | Express 5, Mongoose 8, jose (Google id_token verification via public JWKS + local HS256 session tokens), Zod validation, Helmet, CORS, rate limiting |
| Database  | MongoDB Atlas |
| Payments  | `PaymentProvider` interface — **mock KHQR provider** now; swap in Bakong / ABA / ACLEDA / Wing later |
| SMM       | `SmmProvider` interface — real smmwiz.com API v2 client + in-memory mock for local dev |

---

## Getting started

### 1. Install

```bash
npm install        # installs frontend, backend and admin workspaces
```

### 2. Environment variables

Copy each `.env.example` to `.env` and fill in the values.

**`backend/.env`**

```dotenv
NODE_ENV=development
PORT=4000

# MongoDB Atlas (required)
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/vidsmm

# Optional: explicit DNS servers (comma-separated). Fixes `querySrv ECONNREFUSED`
# on Windows/ISP networks where Node's resolver (c-ares) fails SRV lookups even
# though nslookup works. Leave empty to use the system resolver.
DNS_SERVERS=1.1.1.1,8.8.8.8

# Customer auth — Google OAuth 2.0 (Google sign-in)
# Google Cloud Console → APIs & Services → Credentials → OAuth client ID
# (Web application). Authorized redirect URI: http://localhost:5173/auth/callback
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxx
FRONTEND_URL=http://localhost:5173
CUSTOMER_JWT_SECRET=change-me-to-a-random-32-byte-secret
CUSTOMER_JWT_EXPIRES_IN=7d

# Admin auth (email + password, stored in MongoDB)
ADMIN_JWT_SECRET=change-me-to-a-random-32-byte-secret
ADMIN_JWT_EXPIRES_IN=12h
SUPER_ADMIN_EMAIL=
SUPER_ADMIN_PASSWORD=

CORS_ORIGINS=http://localhost:5173,http://localhost:5174

# SMM provider: "smmwiz" (real) or "mock" (no key needed)
SMM_PROVIDER=smmwiz
SMMWIZ_API_URL=https://smmwiz.com/api/v2
SMMWIZ_API_KEY=your_smmwiz_api_key

# Payment provider: "mock" (no key), "cutluy" (real Bakong KHQR) or "abapayway"
PAYMENT_PROVIDER=mock

# CutLuy (https://cutluy.com) — real Bakong KHQR payments
CUTLUY_API_URL=https://cutluy.com/v1
CUTLUY_API_KEY=ck_live_xxxx
CUTLUY_WEBHOOK_SECRET=whsec_xxxx

# ABA PayWay (future / optional second provider)
ABAPAYWAY_API_URL=https://checkout.payway.com.kh/api/payment-gateway/v1/payments
ABAPAYWAY_MERCHANT_ID=payment_xxxx
ABAPAYWAY_API_KEY=xxxx
ABAPAYWAY_RETURN_URL=http://localhost:5173/dashboard/wallet

ENABLE_ORDER_SYNC_JOB=false
ORDER_SYNC_INTERVAL_MS=60000
```

**`frontend/.env`** and **`admin/.env`**

```dotenv
VITE_API_BASE_URL=/api
```

### 3. Run

```bash
npm run dev        # backend (4000) + frontend (5173) + admin (5174)
```

- Customer app: **http://localhost:5173**
- Admin panel: **http://localhost:5174**
- API health: **http://localhost:4000/api/health**

---

## Google OAuth setup (customer login)

1. Open the **Google Cloud Console** → **APIs & Services → OAuth consent screen** and
   configure the app (External, add your email as a test user while in Testing mode).
2. **APIs & Services → Credentials → Create credentials → OAuth client ID → Web
   application**.
3. Add the **Authorized redirect URI**: `http://localhost:5173/auth/callback`
   (in production: `https://<your-domain>/auth/callback`).
4. Copy the **Client ID** and **Client Secret** into `backend/.env` as
   `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` and restart the backend.

### Why other Gmails can't sign in (Google "Testing" mode)

While the OAuth consent screen is in **Testing** mode, Google only allows accounts you
listed as **Test users**. To let **every** Gmail sign in, publish the app:

1. Google Cloud Console → **OAuth consent screen** → **Publish app** → **Confirm**.
2. Until then, add each test Gmail under **Test users** (or use the **email + password**
   admin panel at :5174, which has no Google restriction).

### How it works

- The sign-in page calls `GET /api/auth/google/url`, which returns the Google consent
  URL with a signed `state` token (CSRF protection) and a PKCE verifier.
- Google redirects back to `/auth/callback?code=…&state=…`; the SPA exchanges the code
  at `POST /api/auth/google/exchange`. The backend verifies the Google `id_token`
  (signature + issuer + audience) and issues a short-lived HS256 session JWT.
- The session JWT is stored client-side and sent as `Authorization: Bearer …` on every
  API call (same pattern as the admin panel).

### Admin roles (email + password, stored in MongoDB)

The admin panel has its **own authentication**, completely separate from the customer
Google sign-in. Admins sign in with **email + password** (stored in MongoDB,
scrypt-hashed), and sessions are issued as HS256 JWTs signed with
`ADMIN_JWT_SECRET`. There are two roles:

- `admin` — full panel access (orders, users, payments, settings)
- `super_admin` — everything + **Admins & Roles** (create admins, assign roles)

### Super admin bootstrap

Create your first super admin account (email + password stored in MongoDB):

```bash
cd backend
SUPER_ADMIN_PASSWORD='YOUR_STRONG_PASSWORD' npm run create:super-admin -- --email your@email.com
```

Prefer the `SUPER_ADMIN_PASSWORD` env var so the password never appears in shell
history (`--password` is accepted as a fallback). It is scrypt-hashed and **never
stored in plaintext**. Alternatively, set `SUPER_ADMIN_EMAIL` + `SUPER_ADMIN_PASSWORD`
in `backend/.env` and the first super admin is seeded automatically on boot.

### Admins & Roles page (super admin only)

The sidebar shows **Admins & Roles** (super admin only): list admins, create new admins
(email + password + role) — stored directly in MongoDB — change roles, or remove admin
access. New admins can then sign in at :5174 immediately with their email + password;
**no external dashboard step is needed**. A super admin cannot demote or remove
themselves (no lockout). Every sensitive action is written to an **audit log** (`audit_logs`)
shown on the Admins page, so a compromised super admin cannot silently hand out
`super_admin` access.

---

## SMM provider (smmwiz.com)

The backend implements the full **smmwiz.com API v2** guide:

| Action | Endpoint used | Backend method |
|--------|---------------|----------------|
| Service list | `action=services` | `SmmWizProvider.getServices()` |
| Add order (all 12 types) | `action=add` | `SmmWizProvider.createOrder()` |
| Order status (single/bulk) | `action=status` | `getOrderStatus` / `getOrdersStatus` |
| Refill (single/bulk) | `action=refill` | `createRefill` / `createRefills` |
| Refill status | `action=refill_status` | `getRefillStatus` / `getRefillsStatus` |
| Cancel (bulk) | `action=cancel` | `cancelOrders` |
| Balance | `action=balance` | `getBalance` |

All 12 order types (Default, Package, SEO, Custom Comments, Mentions, Mentions User
Followers, Custom Comments Package, Comment Likes, Poll, Comment Replies, Invites from
Groups, Subscriptions, Web Traffic) are validated type-specifically in
`backend/src/services/order.service.ts` and surfaced in the buy-flow modal in the
frontend.

> Set `SMM_PROVIDER=mock` to run the whole pipeline locally without an API key. Sync the
> catalogue from **Admin → Dashboard → "Sync services from provider"**.

---

## Payments

`backend/src/interfaces/payment-provider.interface.ts` defines a provider-agnostic contract:

```ts
createPayment(input)        // → QR payload + hosted checkout URL
getPayment(providerId)      // → provider-side status (polling)
refund(providerId, amount)  // → refund result (if the rail supports it)
verifyWebhook(rawBody, hdrs) // → HMAC/hash-verified, normalised event
```

### Providers

| Provider | `PAYMENT_PROVIDER` | Flow |
|----------|--------------------|------|
| **CutLuy** (Bakong KHQR) | `cutluy` | Real KHQR QR + hosted branded checkout + signed webhooks |
| **ABA PayWay** | `abapayway` | Hosted checkout redirect + IPN hash verification |
| Mock (local demo) | `mock` (default) | Renders a KHQR-style QR; settles ~8s after creation |

All providers live under `backend/src/modules/payment/providers/<name>/` and are selected
in `backend/src/services/payment/payment.factory.ts`. Adding a new rail (Bakong API,
ACLEDA, Wing) is a new folder + one factory branch — business logic never changes.

### CutLuy integration

- **Create payment** — the buy flow creates a local order (`Pending Payment`), then calls
  `POST /v1/payments` with `reference_id` + `idempotency_key` (both = the internal
  `PAY-…` reference, so retries never double-charge). The QR + `checkout_url` are stored
  and served to the frontend.
- **Webhooks** — configure `https://<your-backend>/webhooks/cutluy` in the CutLuy dashboard.
  Every delivery is **HMAC-SHA256 signature-verified** (constant-time, 5-minute freshness
  window for replay protection) against the RAW body and logged to `webhook_logs`.
  `payment.completed` → payment `paid` → order placed at the SMM provider. Idempotent,
  so CutLuy's up-to-8 retries are safe.
- **Live status** — the checkout page streams `Server-Sent Events` from
  `GET /api/payment/events?reference=…` (fetch-based, so the session token is attached)
  and falls back to 5s polling automatically.
- **Status ladder** — `pending → scanned → paid → processing → completed` (plus
  `expired` / `failed` with a “Generate new QR” retry that reuses the same order).

### Order & payment statuses

- Order: `Pending Payment → Paid → Processing → In progress → Partial → Completed`,
  plus `Cancelled / Refunded / Failed`.
- Payment: `pending / scanned / paid / expired / failed / refunded`.

---

## API overview

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/health` | — | Health check |
| GET | `/api/auth/google/url` | — | Start Google sign-in (returns the consent URL) |
| POST | `/api/auth/google/exchange` | — | Exchange the Google code for a session JWT |
| GET | `/api/auth/me` | ✅ | Current session user (rehydration) |
| POST | `/api/auth/logout` | ✅ | End the session |
| GET | `/api/services` | — | Public service list (category/search/featured/pagination) |
| GET | `/api/categories` | — | Public categories |
| GET | `/api/announcements` | — | Active announcements |
| POST | `/api/orders` | ✅ | Place a wallet-funded order |
| GET | `/api/orders` | ✅ | My orders (status filter + pagination) |
| GET | `/api/orders/:id` | ✅ | Order detail |
| POST | `/api/orders/:id/cancel` | ✅ | Cancel (refunds wallet orders) |
| POST | `/api/orders/:id/refill` | ✅ | Request a refill |
| POST | `/api/payment/create` | ✅ | Create local order + KHQR payment (topup or order) |
| GET | `/api/payment/status?reference=` | ✅ | Payment status + order (polling) |
| POST | `/api/payment/verify` | ✅ | Force provider check; settle when paid |
| POST | `/api/payment/cancel` | ✅ | Cancel a pending payment |
| POST | `/api/payment/retry` | ✅ | Fresh QR for an existing pending order |
| GET | `/api/payment/events?reference=` | ✅ | Live SSE status stream |
| GET | `/api/payment/history` | ✅ | My payments (timeline) |
| POST | `/webhooks/cutluy` | 🔒 | CutLuy webhook (HMAC verified) |
| GET | `/api/admin/payments/stats` | ✅ admin | Payment KPIs (today's revenue, counts) |
| GET | `/api/admin/payments/export` | ✅ admin | Payments CSV export |
| GET / PATCH | `/api/profile` | ✅ | Profile + wallet |
| POST | `/api/admin/auth/login` | — | Admin sign-in (email + password) |
| GET | `/api/admin/auth/me` | ✅ admin | Current admin profile |
| GET | `/api/admin/stats` | ✅ admin | Dashboard stats |
| POST | `/api/admin/services/sync` | ✅ admin | Sync provider catalogue |
| CRUD | `/api/admin/services`, `/api/admin/categories`, `/api/admin/announcements` | ✅ admin | Catalogue management |
| GET/PUT | `/api/admin/users` | ✅ admin | Users & roles |
| GET/PUT | `/api/admin/orders` | ✅ admin | Orders & status |
| GET | `/api/admin/admins` | ✅ super admin | List admin accounts (MongoDB) |
| POST | `/api/admin/admins` | ✅ super admin | Create admin (email + password + role) |
| PUT | `/api/admin/admins/:id/role` | ✅ super admin | Set role (admin / super_admin) |
| DELETE | `/api/admin/admins/:id/role` | ✅ super admin | Remove admin access |
| GET | `/api/admin/audit-logs` | ✅ super admin | Audit trail of admin role changes |
| GET | `/api/admin/payments` | ✅ admin | Payments |
| GET/PUT | `/api/admin/settings` | ✅ admin | Platform settings |

---

## Scripts

```bash
npm run dev          # run all three apps concurrently
npm run build        # type-check + build all three
npm run typecheck    # vue-tsc / tsc across all workspaces
npm run test         # backend unit + API smoke tests (vitest + supertest)
npm run start        # run the built backend (production)
```

## Testing

Backend tests run with **vitest** (+ supertest for the API):

```bash
npm test             # or: npm run test -w backend
```

Covers the KHQR builder, the smmwiz provider client (form encoding, newline-joined
lists, error bodies, numeric coercion), CutLuy webhook signature verification (valid /
tampered / replay / wrong secret), ABA PayWay HMAC-SHA512 hashing, and API-level smoke
tests (health, 404 vs 401 behaviour, auth guards, CORS).

## SEO

The frontend ships `public/favicon.svg`, `public/robots.txt` and `public/sitemap.xml`
along with Open Graph / Twitter meta tags in `index.html`. Update the domain in
`public/sitemap.xml` before going live.

## Deployment

- **Frontend / Admin** → Vercel (set the `VITE_*` env vars; point `VITE_API_BASE_URL` at
  the deployed backend).
- **Backend** → any VPS / container host. Build with `npm run build -w backend`, run
  `npm run start`. Enable the order-sync job with `ENABLE_ORDER_SYNC_JOB=true`.
