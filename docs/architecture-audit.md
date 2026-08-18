# DigitalSMM — Architecture Audit

> Status: **audit of the current repository** (branch `main`/`feat/ci-cd`).
> This documents what ACTUALLY exists — nothing imaginary. Items marked
> **[MISSING]** are gaps addressed by the Part 2 upgrade; items marked
> **[MANUAL]** exist in code but need external configuration.

## 1. Repository layout

```
digital-smm/                      npm workspaces monorepo (single lockfile)
├── frontend/                     Vue 3 + TS + Vite + Tailwind + Pinia (customer storefront)
├── admin/                        Vue 3 + TS + Vite (admin panel, independent app)
├── backend/                      Node 20 + Express 5 + TS (API)
│   └── src/
│       ├── config/               env.ts (Zod validation), database.ts, sentry.ts
│       ├── controllers/          health, admin, catalog, order, payment, profile
│       ├── middleware/           request-context, request-metrics, error, rate-limit,
│       │                         admin, auth, validate
│       ├── modules/              auth, payment (providers: cutluy/abapayway/mock),
│       │                         notifications  [NEW — Part 2]
│       ├── services/             monitoring (metrics.store, smm-monitor,
│       │                         alert.service, incident.service, deployment.service [NEW]),
│       │                         smm, order, payment, redis, admin, analytics
│       ├── models/               user, order, payment, wallet, service, category,
│       │                         admin, announcement, setting, audit-log, webhook-log,
│       │                         incident, deployment  [NEW]
│       ├── jobs/                 order-sync.job, daily-report.job  [NEW]
│       └── routes/               health, catalog, order, payment, profile, admin, dev
├── docker-compose.yml            local dev (backend + mongo + redis)
├── docker-compose.prod.yml       production backend (single container, 127.0.0.1 bind)
├── docker-compose.scale.yml      multi-instance scaling experiment
├── .github/workflows/            ci.yml, load-test.yml,
│                                 backend-deploy.yml, frontend-deploy.yml,
│                                 admin-deploy.yml, security-scan.yml  [NEW]
├── scripts/                      notify-telegram.mjs, backend-deploy.sh  [NEW]
└── docs/                         deployment, monitoring, security, environment, …
```

## 2. What already existed (verified, working)

| Area | Implementation | Verified by |
|---|---|---|
| Env validation | `config/env.ts` — Zod schema, fail-fast, no secrets logged | `npm test`, typecheck |
| Structured logging | `utils/logger.ts` — single-line JSON, requestId, child loggers | tests + runtime logs |
| Request correlation | `utils/request-context.ts` (AsyncLocalStorage) + middleware | `request-context.test.ts` |
| Request metrics | `services/monitoring/metrics.store.ts` — p50/p95/p99, error rate, 5-min window | `health.controller.test.ts` |
| Health endpoints | `/api/health`, `/api/ready`, `/api/health/deps`, `/api/health/metrics` | tests |
| Error handling | `middleware/error.middleware.ts` — ApiError, safe 500s, Sentry, redaction | `error.middleware.test.ts` |
| Sentry | `config/sentry.ts` — DSN-optional, request_id tag, header redaction | `sentry.test.ts` |
| Graceful shutdown | SIGINT/SIGTERM → close server, Redis clients, Mongo, jobs | `index.ts` |
| Rate limiting | global + catalogue + admin mutation + login limiters (Redis optional) | `rate-limit.test.ts` |
| Security | Helmet, strict CORS, webhook HMAC (fail-closed), JWT, OAuth PKCE | `security.test.ts` |
| SMM monitoring | `services/monitoring/smm-monitor.ts` — op timing + safe logging | — |
| Admin System Health | `/api/admin/system/health` + `admin/SystemHealthView.vue` | e2e `admin.spec.ts` |
| Analytics | `services/analytics.service.ts` + AnalyticsView | e2e |
| Docker | multi-stage `node:20-alpine`, healthcheck, `127.0.0.1:4000` bind, `restart: unless-stopped` | docker runtime test |
| CI | `ci.yml` — typecheck (3 apps) + unit tests + Playwright e2e (75 tests) | GitHub Actions green |
| Deploy | Vercel (frontend/admin) + VPS Docker (backend) + Cloudflare Tunnel | live site + API |

## 3. Gaps found by the audit (addressed in Part 2)

| Gap | Part 2 deliverable |
|---|---|
| No Telegram notifications | `modules/notifications/` — client, formatter, service (levels + dedup) |
| No incident persistence | `models/incident.model.ts` + `services/monitoring/incident.service.ts` |
| No deployment tracking / version endpoint | `models/deployment.model.ts`, `deployment.service.ts`, `/api/version` |
| No error classification for alerting | `services/monitoring/alert.service.ts` + wiring in error middleware, webhook, smm-monitor |
| No daily operational report | `jobs/daily-report.job.ts` (22:00 Asia/Phnom_Penh, distributed lock) |
| No admin incidents/deployments pages | `SystemIncidentsView.vue`, `SystemDeploymentsView.vue` + admin routes |
| No backend auto-deploy/rollback | `backend-deploy.yml` + `scripts/backend-deploy.sh` |
| No deploy verification for frontend/admin | `frontend-deploy.yml`, `admin-deploy.yml` |
| No secret/dependency scanning in CI | `security-scan.yml` (gitleaks + npm audit) |
| Docker ran as root; no version baked in | Dockerfile `USER node` + ARG VERSION/COMMIT/BUILD_TIME |

## 4. Runtime facts (from production, not assumptions)

- Backend listens on `127.0.0.1:4000` only; **Cloudflare Tunnel** (`api.digitalsmm.shop`) is the only ingress.
- MongoDB = Atlas; Redis optional (single instance → in-memory SSE + rate limits).
- Frontend + admin on Vercel; `VITE_API_BASE_URL` normalized in client code (bare host or `/api` both work).
- Webhooks: `POST /webhooks/cutluy` (no `/api` prefix), HMAC-SHA256 `X-CutLuy-Signature`, fail-closed.
- Google OAuth callback: `${FRONTEND_URL}/auth/callback`.

## 5. Known unsafe/duplicated things

- `docker-compose.yml` (dev) previously pointed at the dead `smmwiz.com` domain — fixed to `wizsmm.com`.
- Frontend/admin builds are public (VITE_*): verified no secrets in `frontend/.env.example` / `admin/.env.example`.
- No DB backups configured yet — see `docs/disaster-recovery.md` **[MANUAL]**.
- Multi-instance scheduler safety now handled by the Mongo distributed lock (`utils/distributed-lock.ts`).
