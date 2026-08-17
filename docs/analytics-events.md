# Analytics Events Reference

Every event this app can send, with its parameters. All parameters are
business-level only — see [analytics.md](./analytics.md) for the privacy model.

## Event table

| Event                | Trigger (frontend UI intent)                          | Trust     | Params                                             |
|----------------------|-------------------------------------------------------|-----------|----------------------------------------------------|
| `sign_up`            | Google exchange created a brand-new account           | backend   | `result, signed_in`                                |
| `login`              | Google exchange for an existing account               | backend   | `result, signed_in`                                |
| `logout`             | Sign-out                                              | frontend  | `signed_in: false`                                 |
| `service_view`       | Public service page viewed                            | frontend  | `service_id, service_type, platform, currency, value` |
| `service_search`     | Search box query (debounced, non-empty)               | frontend  | `search_term` (capped), `signed_in`                |
| `service_select`     | Service picked in the buy flow                        | frontend  | `service_id, service_type, platform, signed_in`    |
| `order_start`        | "Place order" clicked (Explore Services or buy modal) | frontend  | `service_id, service_type, platform, currency, value, quantity, signed_in` |
| `order_create`       | Backend confirmed the order (wallet-funded placement or post-payment) | backend | `service_id, order_type, currency, value, quantity, order_status, signed_in` |
| `order_complete`     | Order transitioned to `Completed` (SSE)               | backend   | `service_id, order_type, currency, value, order_status` |
| `wallet_view`        | Wallet page viewed (WalletView mount)                 | frontend  | `signed_in`                                        |
| `wallet_topup_start` | Top-up amount submitted (before the payment is created) | frontend | `order_type, currency, value`                      |
| `wallet_topup_success` | Backend confirmed top-up paid (wallet modal or checkout page) | backend | `currency, value, provider`                        |
| `payment_create`     | Provider returned a payment (QR/checkout) — wallet top-up or order payment | backend | `order_type, currency, value, provider`            |
| `payment_success`    | Provider + backend verified the charge                | backend   | `order_type, currency, value, provider, payment_status` |
| `payment_failed`     | Backend state `failed`                                | backend   | `order_type, currency, value, provider, payment_status` |
| `payment_expired`    | Backend state `expired`                               | backend   | `order_type, currency, value, provider, payment_status` |
| `refund`             | Order transitioned to `Refunded` (SSE push)           | backend   | `service_id, order_type, currency, value, order_status` |
| `web_vitals`         | RUM: LCP / CLS / INP / TTFB reported                  | frontend  | `lcp, cls, inp, ttfb` (numbers)                    |

## Where events are emitted

| Location                      | Events                                              |
|-------------------------------|-----------------------------------------------------|
| `src/views/AuthCallbackView.vue` | `sign_up` / `login`                              |
| `src/stores/auth.store.ts`    | `logout`                                            |
| `src/views/PublicServiceView.vue` | `service_view`                                  |
| `src/views/ExploreServicesView.vue` | `service_search`, `service_select`, `order_start`, `order_create` |
| `src/components/dashboard/BuyServiceModal.vue` | `order_start`, `order_create`         |
| `src/views/WalletView.vue`    | `wallet_view`                                       |
| `src/stores/orders.store.ts`  | `order_complete`, `refund` (SSE transitions)         |
| `src/stores/wallet.store.ts`  | `wallet_topup_start`, `payment_create` (top-up)      |
| `src/views/OrdersView.vue`    | `payment_create` (order)                             |
| `src/views/OrderDetailView.vue` | `payment_create` (order)                          |
| `src/components/payment/KhqrPaymentModal.vue` | `payment_success`, `wallet_topup_success` |
| `src/views/PaymentView.vue`   | `payment_success`, `wallet_topup_success`, `payment_failed`, `payment_expired`, `order_create` |
| `src/monitoring/performance.ts` | `web_vitals`                                     |
| `src/main.ts` (router hook)   | page views                                          |

## Adding an event

1. Add the name to `AnalyticsEventName` in `src/analytics/types.ts`.
2. Add any new params to `AnalyticsParams` **and** to `ALLOWED_KEYS` in
   `src/analytics/events.ts` (the whitelist is the privacy gate).
3. Emit it from the right place — **backend-verified state** for anything
   financial (`payment_success`, `order_create`, `order_complete`, refunds).
