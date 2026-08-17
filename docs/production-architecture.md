# Production Architecture

The full picture of how the DigitalSMM platform is put together in production:
components, data flow, and the layers added for production readiness (SEO,
analytics, monitoring, health checks, admin operations).

## Components

```text
┌───────────────────────┐   ┌───────────────────────┐
│  Customer SPA (Vue)   │   │  Admin Panel (Vue)    │
│  Vercel               │   │  Vercel               │
│  digitalsmm.shop      │   │  admin.digitalsmm.shop│
└───────────┬───────────┘   └───────────┬───────────┘
            │  HTTPS /api               │  HTTPS /api
            ▼                           ▼
┌──────────────────────────────────────────────────────┐
│  Backend (Express 5, Node 20+) — VPS / Docker        │
│  • Auth: Google OAuth + PKCE, JWT sessions           │
│  • Catalogue: services / categories / announcements  │
│  • Orders + wallet + payments (KHQR providers)       │
│  • SSE live status (payment + order buses)           │
│  • Admin API (roles, audit, analytics, health)       │
│  • Monitoring: Sentry, request metrics, structured   │
│    logging, SMM/payment instrumentation              │
└──────┬─────────────────────┬───────────────────────┘
       ▼                     ▼
   MongoDB (Atlas)       Redis (optional, multi-replica)
```

## Request lifecycle

```text
Client → Nginx/Vercel → requestContextMiddleware (requestId)
      → Helmet → CORS → webhooks (raw body, verified)
      → express.json → routes (rate limited)
      → controller → service → repository → MongoDB
      → response → requestMetricsMiddleware (duration/status)
      → error middleware (safe errors + Sentry)
```

Every request gets a correlation `requestId` (AsyncLocalStorage) that flows
through structured logs, metrics and Sentry events.

## Security

See [security.md](./security.md): Helmet, strict CORS, body limits, signed
webhooks, HMAC-verified payment settlement, admin roles + audit log, centralized
safe error handling, rate limiting (Redis-distributed when scaled).

## SEO

See [seo.md](./seo.md) and [sitemap.md](./sitemap.md): centralized metadata
layer, canonical URLs, Open Graph/Twitter, JSON-LD (Organization, WebSite,
BreadcrumbList, Product), public service landing pages, generated sitemap,
robots.txt.

## Analytics

See [analytics.md](./analytics.md): GA4 behind a typed abstraction with strict
privacy filtering; financial truth comes from backend-verified state, never
button clicks.

## Monitoring

See [monitoring.md](./monitoring.md) and [health-checks.md](./health-checks.md):
frontend RUM (LCP/CLS/INP/TTFB), Sentry on all three apps, backend request
metrics (p50/p95/p99), structured JSON logging with request ids, SMM/payment
flow instrumentation, liveness/readiness/dependency endpoints.

## Admin operations

- **Insights → Analytics** — revenue, orders, users, conversion, top services,
  platform breakdowns (database-backed).
- **System → System Health** — API/MongoDB/Redis/SMM/Payment status, error
  rate, latency, top routes, uptime, deployment version.
- Existing catalog/order/payment/user/admin management is unchanged.

## Environments

See [environment.md](./environment.md) for every variable, its classification
(public / server-only / secret) and the per-environment matrix.
