# Monitoring

DigitalSMM monitors errors, performance and business operations across all three
apps. Everything degrades gracefully — no DSN, no SDK or a blocked CDN simply
disables the corresponding layer.

## Layers

| Layer                     | Where                                      | What it captures                                             |
|---------------------------|--------------------------------------------|--------------------------------------------------------------|
| Frontend RUM              | `frontend/src/monitoring/`                 | LCP / CLS / INP / TTFB → `web_vitals` analytics event.       |
| Frontend errors           | `frontend/src/monitoring/errors.ts`        | Uncaught exceptions, unhandled rejections, Vue errors → Sentry. |
| Frontend Sentry           | `frontend/src/monitoring/sentry.ts`        | `VITE_SENTRY_DSN` + Vue/router integration.                  |
| Backend Sentry            | `backend/src/config/sentry.ts`             | `SENTRY_DSN` + request-id correlation, scrubbed headers.     |
| Request metrics           | `backend/src/middleware/request-metrics.middleware.ts` | method/route/status/duration, p50/p95/p99.      |
| Structured logging        | `backend/src/utils/logger.ts`              | JSON lines with `requestId`, correlation across logs/errors. |
| SMM provider monitoring   | `backend/src/services/monitoring/smm-monitor.ts` | provider call duration/result, safe ids.             |
| Payment flow monitoring   | `backend/src/services/payment.service.ts`  | create/status/webhook/fulfillment logs (safe fields).        |
| Health checks             | `backend/src/controllers/health.controller.ts` | liveness / readiness / dependency detail.              |
| Operational alerts        | `backend/src/services/monitoring/alert.service.ts` | error classification → incidents → Telegram (dedup). |
| Incidents                 | `backend/src/services/monitoring/incident.service.ts` | persistent incident history (admin center).   |
| Deployment tracking       | `backend/src/services/monitoring/deployment.service.ts` | version/commit/status history + rollback target. |
| Daily report              | `backend/src/jobs/daily-report.job.ts` | 22:00 Asia/Phnom_Penh Telegram report (distributed lock). |

## Environment variables

| Variable             | App       | Purpose                                              |
|----------------------|-----------|------------------------------------------------------|
| `VITE_SENTRY_DSN`    | frontend/admin | Client-side Sentry (public DSN).                 |
| `SENTRY_DSN`         | backend   | Server-side Sentry (secret).                         |
| `SENTRY_ENVIRONMENT` | backend   | Environment label (defaults to `NODE_ENV`).          |
| `VITE_APP_ENV`       | frontend/admin | Sentry + analytics environment label.           |
| `VITE_GA_MEASUREMENT_ID` | frontend | RUM reporting destination (analytics).          |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | backend | Operational alerts + daily report (optional, fail-safe). |
| `TELEGRAM_ALERTS_ENABLED` / `TELEGRAM_MIN_ALERT_LEVEL` / `TELEGRAM_ALERT_COOLDOWN_MS` | backend | Alert gating + dedup tuning. |
| `DAILY_REPORT_ENABLED` / `DAILY_REPORT_TIME` / `DAILY_REPORT_TZ` | backend | Daily report schedule (default 22:00 Asia/Phnom_Penh). |
| `APP_VERSION` / `APP_COMMIT` / `APP_BUILD_TIME` | backend | Deployment identity (baked at build). |

## Endpoints

| Endpoint              | Auth  | Purpose                                             |
|-----------------------|-------|-----------------------------------------------------|
| `GET /api/health`     | —     | Liveness (process up).                              |
| `GET /api/ready`      | —     | Readiness (MongoDB + Redis reachable) → 200/503.    |
| `GET /api/health/deps`| —     | Per-dependency status (never fails the request).    |
| `GET /api/health/metrics` | — | Request metrics summary (p50/p95/p99, top routes). |
| `GET /api/version` | — | Safe deployment identity (version/commit/environment). |
| `GET /api/admin/system/health` | admin | Admin System Health page payload.        |
| `GET /api/admin/system/incidents` | admin | Incident list (filter by status/severity/search). |
| `POST /api/admin/system/incidents/:id/resolve` | admin | Resolve an incident. |
| `GET /api/admin/system/deployments` | admin | Deployment history per service.          |

## Privacy

- Sentry `beforeSend` scrubs `authorization`/`cookie`/secret headers and drops
  query strings from request URLs.
- Request metrics store only method/route/status/duration — never bodies.
- SMM monitor logs order ids / provider service ids only, never links or keys.
- Payment logs include reference, provider, status, duration, result — never
  secrets.
- Web vitals contain only numeric timings.

## Admin UI

- **Admin → Insights → Analytics** — revenue, orders, users, conversion, top
  services and platform breakdowns from the database.
- **Admin → System → System Health** — API/MongoDB/Redis/SMM/Payment status,
  error rate, latency percentiles, top routes, uptime, deployment version.
- **Admin → System → Incidents** — operational failures with severity,
  occurrences, first/last seen, resolve inline (auto-refresh 30s).
- **Admin → System → Deployments** — per-service deployment history with
  commit/version/status and the rollback target.

## Operational alerts (Telegram)

See `docs/telegram-alerts.md` and `docs/alerting.md`. Every alert is
level-gated, deduplicated (spike + cooldown), contains safe identifiers only,
and can never take the business logic down.
