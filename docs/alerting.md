# DigitalSMM — Alerting Architecture

## Pipeline

```
Application event / error
  → classifyError()               (services/monitoring/alert.service.ts)
  → category + severity
  → incident (Mongo, dedup by key)
  → telegram.notify()             (modules/notifications — level gate + dedup)
  → Telegram message
```

Nothing in the alerting path can break business logic: every entry point is
wrapped, fire-and-forget, and failures are logged only (spec: observability
must never break login/orders/payments).

## Error categories

`DATABASE_ERROR`, `REDIS_ERROR`, `AUTH_ERROR`, `PAYMENT_ERROR`,
`WEBHOOK_ERROR`, `SMM_PROVIDER_ERROR`, `API_ERROR`, `VALIDATION_ERROR`,
`NETWORK_ERROR`, `INTERNAL_SERVER_ERROR`, `DEPLOYMENT_ERROR`,
`HEALTH_CHECK_ERROR` — see `modules/notifications/notification.types.ts`.

Classification is heuristic over error name/message (pure function, unit
tested). Credential-looking substrings in messages (e.g. `mongodb://user:pass@`)
are redacted before they reach logs, incidents or Telegram.

## Call sites (deliberately few)

| Site | Category / event | Level |
|---|---|---|
| `error.middleware.ts` (unexpected 5xx) | classified, `unhandled_*` | error/critical |
| `cutluy/webhook.service.ts` invalid signature | `WEBHOOK_ERROR` `webhook_invalid_signature` | warning |
| `cutluy/webhook.service.ts` processing failure | `WEBHOOK_ERROR` `webhook_processing_failed` | error |
| `smm-monitor.ts` any provider op failure | `SMM_PROVIDER_ERROR` `provider_operation_failed` | warning |

Provider/webhook/payment errors are **not** double-alerted by the middleware
(they have dedicated call sites).

## Anti-noise rules

- Expected 4xx (bad password, validation, 404s) never alert.
- Identical events dedupe into one spike alert per cooldown window.
- The daily report is sent exactly once per day (Mongo distributed lock).
- All thresholds (cooldown, min level) are env-configurable.
