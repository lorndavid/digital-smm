# DigitalSMM — User Guide

A complete guide for **customers** (using the storefront) and **admins** (running the
platform). DigitalSMM is a social-media marketing (SMM) panel for the Cambodian market:
customers buy followers, views, likes, comments… for TikTok, Facebook, Instagram,
YouTube, Telegram, X and more, pay with **Bakong KHQR**, and track delivery in real time.

---

## 1. System overview

| App | What it is | URL | Port |
|---|---|---|---|
| **frontend** | Customer storefront (Google sign-in, buy, pay, track) | http://localhost:5173 | 5173 |
| **backend** | API + MongoDB + payment/SMM providers | http://localhost:4000 | 4000 |
| **admin** | Admin panel (email + password login) | http://localhost:5174 | 5174 |

How the pieces connect:

```
Customer (5173) ──► Backend API (4000) ──► MongoDB Atlas
      │                     │
      │                     ├─► smmwiz.com (SMM provider: real orders/prices)
      │                     └─► CutLuy (Bakong KHQR payments)
Admin (5174) ──► same API
```

### How to run everything

```bash
# From the project root — starts all 3 apps together:
npm run dev

# …or individually:
npm run dev:backend   # API on :4000
npm run dev:frontend  # storefront on :5173
npm run dev:admin     # admin panel on :5174
```

Before starting, make sure `backend/.env` is complete (it is already filled in for
your setup): `MONGODB_URI`, `CUSTOMER_JWT_SECRET`, `ADMIN_JWT_SECRET`, Google OAuth
keys, SMMWIZ + CUTLUY keys.

Useful commands (run inside `backend/`):

```bash
npm run sync:catalog       # re-fetch all services from the smmwiz API
npm run create:super-admin # create a super admin account
npm test                   # run the backend test suite
npm run loadtest           # payment flow load test
```

---

## 2. Customer guide

### 2.1 Sign in
1. Open http://localhost:5173.
2. Click **Sign in with Google** — your Google account is your identity.
3. You land on your **Dashboard** (balance, stats, announcements).

### 2.2 Explore & choose a service
Open **Explore Services** (dashboard → Services). You can:
- Click a **platform chip** (TikTok, Facebook, Telegram, YouTube, Instagram, More) to
  see only that platform's services, grouped by subcategory.
- **Search** by name, **filter** by rate, service type, refill/cancel support.
- Sort by Recommended / Price / Name / Newest.

**Understanding the price** — every card shows a **Rate / 1,000**, e.g. `$0.84 / 1,000`.
That is the price per **1,000 units**, NOT per unit and NOT ×1000.

- Normal service: `$0.84 / 1,000` → 30,000 viewers costs `30,000 × 0.84 ÷ 1000 = $25.20`.
- **Package / bundle** services (sold as exactly one unit, `min 1 – max 1`) are labeled
  **/ package** and cost exactly the shown rate (e.g. a $1,123 Kick bundle costs $1,123).
- Some services are "PRIVATE" (quote-only on smmwiz) — those are hidden from the store.

### 2.3 Buy a service (the flow)
1. Click **Buy now** on a card.
2. **Paste your link** — the page you want to grow. The modal auto-detects the platform:
   - ✅ `https://www.tiktok.com/@name` → "TikTok link detected"
   - ⚠️ wrong platform for that service → amber warning
   - ❌ invalid/unsafe links → clear error
3. Pick the **quantity** with the +/− stepper (clamped to the service's min/max).
4. Fill any type-specific fields (comments, keywords, username, etc.).
5. Review the **Order summary** (service, link, quantity, rate, total) → **Continue to payment**.

### 2.4 Pay with Bakong KHQR
1. You're taken to the **payment page** with a **KHQR QR code**.
2. Open **Bakong / any KHQR bank app**, scan, confirm the amount.
3. The page **updates in real time** the moment payment settles (no refresh needed —
   a success alert pops up automatically and confetti/confirmation appears).
4. If the QR expires, the page offers a fresh one. You can also **top up your wallet**
   with the same KHQR flow (Wallet → Top up).

> Tip: orders you haven't paid yet show as **Pending Payment** — use **Pay now** on
> the Orders page to resume payment.

### 2.5 Track delivery in real time
Open **Orders** (dashboard → Orders):
- The page **auto-refreshes every 5 seconds** while any order is live (Live badge).
- Each order shows a **status ladder**:
  `Pending payment → Paid → Processing → In progress → Partial → Completed`
- Once the provider starts delivering, a **live progress bar** shows e.g.
  `12,400 / 30,000 delivered · 41%` — updated continuously.
- **Actions**: cancel an order (only services that support cancellation, while still
  processing), request a **refill** (completed orders on refillable services).
- Filter orders by status (All / Pending Payment / … / Completed).

### 2.6 Wallet & history
- **Wallet** — balance, top-up (KHQR), and full transaction history.
- **Payments** — all your top-up and order payments with statuses.
- **Profile / Settings** — your Google profile and preferences.

---

## 3. Admin guide

### 3.1 Login & roles
1. Open http://localhost:5174.
2. Log in with the **admin email + password** from `backend/.env`
   (`SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`).
3. Roles:
   - **Admin** — everything except user management of admins and load tests.
   - **Super Admin** — full access (manage admin accounts, run load tests).

### 3.2 Dashboard
- Revenue (total + KHQR-paid), order/payment stats, provider balance.
- A **sync catalog** action refreshes all services from the smmwiz API.

### 3.3 Services (the most important page)
- **Search / filter** services; every price column shows the **Rate / 1,000** semantics.
- **Edit** a service: name, category, **rate / 1,000 ($)**, min/max, refill, cancel,
  delivery time, active, featured. Remember the price rule:
  - rate = **price per 1,000 units** (e.g. `0.84` → $0.84 per 1,000)
  - services with `min=1, max=1` are sold as a flat bundle — the rate IS the price
- **Toggle active** (hide/show in the store) and **featured** (show as Trending).
- **Bulk actions**: enable/disable/feature multiple services at once.
- **Sync the catalog** to pull smmwiz's current services and rates.
- The smmwiz **PRIVATE** service (rate $99,999,999 = "don't sell online") is disabled —
  don't re-enable it.

### 3.4 Categories
- Create / edit / reorder categories (Facebook, TikTok, Telegram…), set each
  category's **platform** and active state.
- Bulk-assign categories to services.

### 3.5 Orders
- Every order with full detail: user, service, link, quantity, total, status, provider
  order id, delivery counts (`startCount` / `remains`), error messages.
- **Statuses**: Pending Payment → Paid → Processing → In progress → Partial →
  Completed, plus Cancelled / Refunded / Failed.
- Delivery counts update automatically via the **order-sync job** (polls smmwiz
  every 30 s — enabled in `backend/.env`).

### 3.6 Payments
- All KHQR payments with provider, amount, status, reference id, timestamps.
- Cross-reference against orders and top-ups.

### 3.7 Users
- List all customers (balance, spend, top-ups) and open any user's detail page:
  wallet, orders, payments.
- Deactivate accounts if needed.

### 3.8 Announcements
- Publish banner announcements to the storefront (info / success / warning / critical,
  with optional expiry) — shown in the customer dashboard.

### 3.9 Settings & Admins
- **Settings**: platform-level configuration (payment provider, SMM provider, etc.).
- **Admins**: add/remove admin accounts, change roles, view audit logs (Super Admin only).
- **Load tests** (Super Admin only): stress-test the payment flow.

---

## 4. Key concepts every admin should know

| Concept | Meaning |
|---|---|
| **Rate / 1,000** | `pricePerUnit` is the price per 1,000 units. Order total = `qty × rate ÷ 1000`. |
| **Flat bundles** | `min=1, max=1` services are one-time packages — the rate is the price. |
| **Delivery progress** | Provider's `remains` (units left to deliver) drives the progress bar: `(qty − remains) ÷ qty`. |
| **Order-sync job** | Background job (`ENABLE_ORDER_SYNC_JOB`) polling smmwiz so statuses/counts stay fresh. |
| **Real-time payment** | Server-Sent Events push payment success to the page instantly. |
| **KHQR providers** | CutLuy (live Bakong) is configured; mock/ABA also supported. |
| **Wallet** | Customers can top up via KHQR or pay per order; orders debit the wallet after placement. |

---

## 5. Troubleshooting

| Symptom | Fix |
|---|---|
| Backend won't start (env errors) | Check `backend/.env` has `MONGODB_URI`, `CUSTOMER_JWT_SECRET`, `ADMIN_JWT_SECRET`. |
| No services in the store | Run the catalog sync (admin Dashboard or `npm run sync:catalog` in `backend/`). |
| Progress bar not moving | Only shows for real provider orders while `In progress`/`Partial`; ensure the sync job is on and the smmwiz key is valid. |
| Payment not settling | Scan within the QR expiry; check the CutLuy keys; check the payment status in the admin Payments page. |
| Orders show old prices | Historical orders keep their original amounts; new orders use the rate/1,000 formula. |
