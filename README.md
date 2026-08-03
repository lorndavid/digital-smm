# VidSMM 🇰🇭

**The #1 Cambodia Social Media Marketing Platform.**

A production-ready, monorepo SaaS for buying social media growth — TikTok, Facebook,
Instagram, YouTube and Telegram — with wallet top-ups, **Bakong KHQR payments** (mock for
the MVP) and real-time order tracking via the [smmwiz.com](https://smmwiz.com) API v2.

---

## Architecture

```
root/
├── frontend/   Vue 3 + TypeScript + Vite + TailwindCSS v4 + Pinia + Clerk   (port 5173)
├── backend/    Node.js + Express 5 + TypeScript + MongoDB Atlas + Mongoose   (port 4000)
└── admin/      Separate Vue 3 admin panel (same stack)                       (port 5174)
```

### Tech stack

| Layer     | Tools |
|-----------|-------|
| Frontend  | Vue 3.5, Vite 8, TypeScript 5.9, TailwindCSS 4, Pinia 3, Vue Router 4, VueUse, Vue Motion (`@vueuse/motion`), Axios, lucide icons |
| Auth      | Clerk (`@clerk/vue`) — Google sign-in, `UserButton`, protected routes, custom session token for the admin role |
| Backend   | Express 5, Mongoose 8, jose (Clerk JWT verification via remote JWKS), Zod validation, Helmet, CORS, rate limiting |
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

# Clerk JWT verification (required)
# Clerk Dashboard → API Keys → "Frontend API URL", e.g.
#   https://clerk-vivid-snake-12.clerk.accounts.dev
CLERK_JWKS_URL=https://<your-clerk-domain>/.well-known/jwks.json
CLERK_ISSUER=https://<your-clerk-domain>
CLERK_ADMIN_ROLE=admin

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
VITE_CLERK_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxxxxx
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

## Clerk setup

1. Create a Clerk application (Google OAuth is all you need).
2. Copy the **Publishable Key** into `frontend/.env` and `admin/.env`.
3. Copy the **Frontend API URL** into `backend/.env` as `CLERK_JWKS_URL` (+ optional issuer).

### Admin role

The admin panel requires a custom session token claim. In Clerk:

1. **Sessions → Customize session token**, add:
   ```json
   { "role": "{{user.public_metadata.role}}" }
   ```
2. Set your account's `public_metadata.role` to `"admin"` (Dashboard → Users → your user
   → Metadata).

The backend checks `CLERK_ADMIN_ROLE` (default `admin`) against the `role` claim.

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
  `GET /api/payment/events?reference=…` (fetch-based, so the Clerk token is attached) and
  falls back to 5s polling automatically.
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
| GET | `/api/admin/stats` | ✅ admin | Dashboard stats |
| POST | `/api/admin/services/sync` | ✅ admin | Sync provider catalogue |
| CRUD | `/api/admin/services`, `/api/admin/categories`, `/api/admin/announcements` | ✅ admin | Catalogue management |
| GET/PUT | `/api/admin/users` | ✅ admin | Users & roles |
| GET/PUT | `/api/admin/orders` | ✅ admin | Orders & status |
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
