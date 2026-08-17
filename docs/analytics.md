# Analytics

DigitalSMM tracks customer behaviour with **Google Analytics 4 (GA4)** through a
thin, typed abstraction layer in the frontend. This document explains the
architecture, what is tracked, and what is deliberately never tracked.

---

## Architecture

```text
Vue components
      ↓
analytics abstraction (frontend/src/analytics/)
      ↓
GA4 (gtag.js)
```

Components **never** call `gtag()` directly — they call `analytics.event(name, params)`
or rely on the router hook for page views. This keeps the GA implementation in one
place and makes the privacy filtering impossible to bypass.

### Files

| File                      | Responsibility                                              |
|---------------------------|-------------------------------------------------------------|
| `src/analytics/config.ts` | Measurement id + environment detection (`VITE_APP_ENV`).    |
| `src/analytics/types.ts`  | Typed event names + allowed params (whitelist contract).    |
| `src/analytics/events.ts` | Sanitized `trackEvent()` — strips anything not whitelisted. |
| `src/analytics/pageview.ts`| SPA `page_view` tracking with dedupe.                       |
| `src/analytics/consent.ts`| Opt-out flag (`localStorage['digitalsmm:analytics']`).      |
| `src/analytics/index.ts`  | Public API: `initialize()`, `pageView()`, `event()`.        |

## Enabling

Set in `frontend/.env` (public value):

```env
VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX
VITE_APP_ENV=production
```

Empty measurement id → every analytics call is a safe no-op; the app is unaffected.

## What is tracked

- **Page views** — every route transition (`router.afterEach`), deduplicated.
- **Identity** — `sign_up` (only when the backend reports a brand-new account),
  `login`, `logout`.
- **Catalogue** — `service_view`, `service_search` (capped search term),
  `service_select`.
- **Orders** — `order_start` (place-order intent), `order_create` (backend
  confirmed the placement — wallet-funded or post-payment), `order_complete` /
  `refund` (only when the backend confirms the status transition).
- **Wallet** — `wallet_view` (page viewed), `wallet_topup_start`, `wallet_topup_success`
  (verified top-up settlement, from the wallet modal or the checkout page).
- **Payments** — `payment_create` (provider returned a QR/checkout — top-up or
  order), `payment_success` / `payment_failed` / `payment_expired` (only from
  **backend-verified** state).
- **RUM** — `web_vitals` (LCP / CLS / INP / TTFB).

## Payment truth (important)

`payment_success` is **never** fired from a button click. It fires only when the
backend — having verified the charge with the payment provider — reports the
payment as `paid` (SSE event / status poll). The same rule applies to
`order_complete` and `wallet_topup_success`. The frontend sends **intent**
events (`order_start`, `wallet_topup_start`) at click time; **financial truth**
always comes from database state.

## Privacy filtering

Every event passes a strict whitelist (`ALLOWED_KEYS` in `events.ts`). Only
business-level fields are permitted:

```text
service_id, platform, category, service_type, order_type,
currency, value, quantity, result, provider, search_term,
route_name, order_status, signed_in, payment_status,
lcp, cls, inp, ttfb
```

Never sent (by construction):

```text
passwords, JWTs, access/refresh tokens, Google OAuth tokens,
payment credentials, KHQR payloads, API keys, emails, links,
private customer data
```

Free-text `search_term` is trimmed and capped at 80 characters.

## Consent

No consent banner is shipped yet, but the layer respects an opt-out flag:

```js
localStorage.setItem('digitalsmm:analytics', 'denied') // disables tracking
localStorage.removeItem('digitalsmm:analytics')         // re-enables
```

## Verifying

1. Open the site with `VITE_GA_MEASUREMENT_ID` set.
2. In GA4 → Reports → Realtime, navigate around — page views appear.
3. Trigger an order → `order_start` appears at click, `order_create` on success.
4. Confirm no event contains tokens, links or emails (network tab → the
   `collect` request payload is sanitized).
