# Environment Configuration

This document explains every environment variable in the DigitalSMM monorepo, which
environment (development / staging / production) it belongs to, and whether it is
**public** (safe to expose to browsers), **server-only** or a **secret**.

> **Golden rule:** anything prefixed `VITE_` is compiled into the JavaScript bundle
> shipped to browsers. It is **public**. Never put database credentials, JWT secrets,
> OAuth client secrets, payment API keys, SMM API keys or webhook secrets in a
> `VITE_*` variable.

---

## Environments

| Environment   | Backend `NODE_ENV` | Frontend `VITE_APP_ENV` | Notes                                                        |
|---------------|--------------------|-------------------------|--------------------------------------------------------------|
| Development   | `development`      | `development`           | Local machines; `npm run dev`. Mock providers by default.    |
| Staging       | `production`       | `staging`               | A pre-production deploy (same build as prod, non-live keys). |
| Production    | `production`       | `production`            | The live site (`digitalsmm.shop`).                           |

The backend uses `NODE_ENV` to switch behaviour (safe error messages, morgan log
format, dev-only routes, etc.). The frontend uses `VITE_APP_ENV` for the Sentry /
analytics environment label — it has **no effect on business logic**.

---

## Variable classification

| Classification | Meaning                                                                           |
|----------------|-----------------------------------------------------------------------------------|
| Public         | Safe to embed in the browser bundle.                                              |
| Server-only    | Read by the backend only; must never reach the browser.                           |
| Secret         | Server-only credential. Rotate and protect like a password.                       |
| Required       | Boot fails fast with a readable message when missing/invalid.                     |
| Optional       | Feature is disabled gracefully when empty.                                        |

---

## Frontend (`frontend/.env` — all **public**)

| Variable                 | Class      | Description                                                            |
|--------------------------|------------|------------------------------------------------------------------------|
| `VITE_API_BASE_URL`      | Public, req. | Backend origin (`/api` in dev via Vite proxy; e.g. `https://api.digitalsmm.shop` in prod). The client appends `/api` automatically. |
| `VITE_APP_ENV`           | Public     | `development` \| `staging` \| `production`. Sentry/analytics label.     |
| `VITE_GA_MEASUREMENT_ID` | Public, opt. | GA4 Measurement ID (e.g. `G-XXXXXXXXXX`). Empty → analytics disabled.  |
| `VITE_SENTRY_DSN`        | Public, opt. | Frontend Sentry DSN. Empty → Sentry disabled.                          |

## Admin panel (`admin/.env` — all **public**)

| Variable                 | Class      | Description                                                            |
|--------------------------|------------|------------------------------------------------------------------------|
| `VITE_API_BASE_URL`      | Public, req. | Backend origin for the admin API.                                      |
| `VITE_APP_ENV`           | Public     | `development` \| `staging` \| `production`.                            |
| `VITE_SENTRY_DSN`        | Public, opt. | Admin Sentry DSN. Empty → disabled.                                    |

## Backend (`backend/.env`)

| Variable                     | Class        | Description                                                                 |
|------------------------------|--------------|-----------------------------------------------------------------------------|
| `NODE_ENV`                   | Server-only  | `development` \| `test` \| `production`.                                     |
| `PORT`                       | Server-only  | HTTP port (default `4000`).                                                 |
| `MONGODB_URI`                | **Secret**, req. | MongoDB connection string (Atlas).                                     |
| `DNS_SERVERS`                | Server-only  | Optional comma-separated DNS servers fixing `querySrv ECONNREFUSED`.         |
| `GOOGLE_CLIENT_ID`           | **Secret**, opt. | Google OAuth client id. Missing → customer sign-in disabled.           |
| `GOOGLE_CLIENT_SECRET`       | **Secret**, opt. | Google OAuth client secret.                                            |
| `FRONTEND_URL`               | Server-only  | Customer frontend origin (Google redirect target).                          |
| `CUSTOMER_JWT_SECRET`        | **Secret**, req. | Signs customer session JWTs (≥16 chars).                                |
| `CUSTOMER_JWT_EXPIRES_IN`    | Server-only  | Customer session TTL (default `7d`).                                        |
| `OAUTH_STATE_TTL_SECONDS`    | Server-only  | OAuth `state` token lifetime (default `600`).                                |
| `ADMIN_JWT_SECRET`           | **Secret**, req. | Signs admin session JWTs (≥16 chars).                                  |
| `ADMIN_JWT_EXPIRES_IN`       | Server-only  | Admin session TTL (default `12h`).                                          |
| `SUPER_ADMIN_EMAIL`          | Server-only  | Auto-seed first super admin on boot (optional).                              |
| `SUPER_ADMIN_PASSWORD`       | **Secret**, opt. | Super admin bootstrap password (≥8 chars).                             |
| `CORS_ORIGINS`               | Server-only  | Comma-separated allowed origins.                                             |
| `SMM_PROVIDER`               | Server-only  | `smmwiz` \| `mock`.                                                          |
| `SMMWIZ_API_URL`             | Server-only  | SMM provider endpoint (default `https://wizsmm.com/api/v2`).                 |
| `SMMWIZ_API_KEY`             | **Secret**, opt. | SMM provider API key.                                                  |
| `PAYMENT_PROVIDER`           | Server-only  | `mock` \| `cutluy` \| `abapayway`.                                           |
| `CUTLUY_API_URL`             | Server-only  | CutLuy endpoint.                                                             |
| `CUTLUY_API_KEY`             | **Secret**, opt. | CutLuy API key.                                                        |
| `CUTLUY_WEBHOOK_SECRET`      | **Secret**, opt. | CutLuy webhook signing secret (fail-closed when missing).              |
| `ABAPAYWAY_*`                | **Secret**, opt. | ABA PayWay merchant credentials.                                       |
| `ABAPAYWAY_RETURN_URL`       | Server-only  | ABA hosted-checkout return URL.                                              |
| `SENTRY_DSN`                 | **Secret**, opt. | Backend Sentry DSN. Empty → disabled.                                  |
| `SENTRY_ENVIRONMENT`         | Server-only  | Sentry environment label (defaults to `NODE_ENV`).                           |
| `RATE_LIMIT_WINDOW_MS`       | Server-only  | Rate-limit window (default `900000`).                                        |
| `RATE_LIMIT_MAX`             | Server-only  | Global API quota per window (default `3000`).                                |
| `RATE_LIMIT_CATALOGUE_MAX`   | Server-only  | Storefront catalogue quota per window (default `10000`).                     |
| `REDIS_URL`                  | Server-only, opt. | Enables cross-instance SSE + distributed rate limiting.                |
| `ENABLE_ORDER_SYNC_JOB`      | Server-only  | `true`/`false` — provider order-status sync job.                              |
| `ORDER_SYNC_INTERVAL_MS`     | Server-only  | Sync interval (default `60000`).                                             |

---

## Secrets never to expose

The following must **never** appear in a `VITE_*` variable, analytics events, Sentry
breadcrumbs or client-side storage:

- `MONGODB_URI` (database credentials)
- `CUSTOMER_JWT_SECRET` / `ADMIN_JWT_SECRET` (JWT signing secrets)
- `GOOGLE_CLIENT_SECRET` / Google OAuth tokens
- `SMMWIZ_API_KEY` / `CUTLUY_API_KEY` / `ABAPAYWAY_API_KEY` (payment/SMM keys)
- `CUTLUY_WEBHOOK_SECRET` / any webhook secret
- `SUPER_ADMIN_PASSWORD`
- `SENTRY_DSN` for the backend (a backend DSN can be used to *read* events)

Frontend `VITE_SENTRY_DSN` and `VITE_GA_MEASUREMENT_ID` are public by design — the
browser must know where to send data. The **backend** Sentry DSN is different: it is
a server-side secret that allows reading project events, so it stays out of the
browser bundle.

---

## Per-environment matrix

| Variable                      | Development | Staging   | Production            |
|-------------------------------|-------------|-----------|-----------------------|
| `NODE_ENV`                    | development | production | production          |
| `VITE_APP_ENV`                | development | staging   | production            |
| `SENTRY_ENVIRONMENT`          | development | staging   | production            |
| `VITE_GA_MEASUREMENT_ID`      | (empty)     | test G-…   | live G-…              |
| `VITE_SENTRY_DSN`             | (empty)     | set       | set                   |
| `SENTRY_DSN` (backend)        | (empty)     | set       | set                   |
| `SMM_PROVIDER`                | `mock`      | `smmwiz`  | `smmwiz`              |
| `PAYMENT_PROVIDER`            | `mock`      | `cutluy`  | `cutluy`              |
| `REDIS_URL`                   | (empty)     | set       | set (multi-replica)   |
| `ENABLE_ORDER_SYNC_JOB`       | `false`     | `true`    | `true`                |
| `CORS_ORIGINS`                | localhost   | staging origins | `https://digitalsmm.shop,https://www.digitalsmm.shop,https://admin.digitalsmm.shop` |
