# 06 — Sentry

> ⚠️ **Manual step.** These actions happen in the Sentry dashboard — the AI
> agent cannot create the account or projects for you. Nothing here has been
> configured.

## Goal

Create the Sentry projects (backend, customer frontend, admin) so events are
routed to the right project.

## Current status

The **customer frontend and admin DSNs are already baked into their bundles**
(`frontend/src/monitoring/sentry.ts` and `admin/src/monitoring/sentry.ts` —
`DEFAULT_SENTRY_DSN`). DSNs are public by design (the browser must know where
to send events), so they ship in the client code. `VITE_SENTRY_DSN` can
override the baked-in DSN per environment, but it is no longer required.

The **backend** DSN is a secret (it can read project events) and must only live
in `backend/.env`.

## Steps

1. **Sentry** → https://sentry.io → sign up (or log in).
2. **Create a project** for the backend:
   - Platform: **Node.js / Express** → name: `digitalsmm-backend`.
   - Copy the **DSN** (`https://<key>@o<org>.ingest.sentry.io/<project>`).
3. **Create a project** for the customer frontend:
   - Platform: **Vue** → name: `digitalsmm-frontend`.
4. **Create a project** for the admin panel:
   - Platform: **Vue** → name: `digitalsmm-admin`.

## Configure in the repo

```env
# backend/.env (secret — server only)
SENTRY_DSN=https://<key>@o<org>.ingest.sentry.io/<project>
SENTRY_ENVIRONMENT=production
```

```env
# frontend/.env + admin/.env — OPTIONAL (only to override the baked-in DSN)
VITE_SENTRY_DSN=https://<key>@o<org>.ingest.sentry.io/<project>
VITE_APP_ENV=production
```

> Use a **different** DSN per app. The backend DSN allows reading project events,
> so it must never be exposed to browsers — the frontend/admin DSNs are public
> and only allow writes from those apps.

## Expected result

- Backend: uncaught exceptions, request failures, provider/database/payment/
  webhook failures are reported (see docs/monitoring.md). Events carry the
  `request_id` tag for correlation.
- Frontends: Vue errors, router errors, unhandled exceptions and rejections are
  reported.
- Sensitive data (authorization headers, cookies, secrets, query strings) is
  scrubbed before sending.

## Verify

1. Backend: trigger a 500 (or temporarily throw in a dev deployment) →
   Sentry → Issues shows it with `request_id`.
2. Frontend: open the site, force a JS error (or use Sentry's test button) →
   Issues shows the Vue error.
3. Confirm no event contains tokens/passwords (click an issue → check
   request headers are scrubbed).

## Gotchas

- DSNs are project-specific — mixing them sends events to the wrong project.
- `SENTRY_ENVIRONMENT` must match the deploy (production/staging/development)
  so issues are filterable.
- Sentry is optional: empty DSN → monitoring degrades gracefully (structured
  logs still capture errors locally).
