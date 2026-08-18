# DigitalSMM — Telegram Alerts

## What gets sent

| Event | Level | Where |
|---|---|---|
| Backend deploy started / success / failure | INFO / ERROR | `backend-deploy.yml` + `scripts/backend-deploy.sh` |
| Rollback started / succeeded / failed | WARNING / CRITICAL | `scripts/backend-deploy.sh` |
| Frontend / admin deploy verified (or failed smoke test) | INFO / ERROR | `frontend-deploy.yml`, `admin-deploy.yml` |
| Unhandled backend 5xx (non-provider) | ERROR / CRITICAL | `middleware/error.middleware.ts` → `alert.service.ts` |
| CutLuy webhook invalid signature (security event) | WARNING | `modules/payment/providers/cutluy/webhook.service.ts` |
| CutLuy webhook processing failure | ERROR | same |
| SMM provider operation failure | WARNING | `services/monitoring/smm-monitor.ts` |
| Daily operational report | — | `jobs/daily-report.job.ts` (22:00 Asia/Phnom_Penh) |

## Levels & gating

`info < warning < error < critical`. `TELEGRAM_MIN_ALERT_LEVEL` (default
`warning`) drops everything below it. Normal user mistakes (bad password,
validation errors, 404s) **never** alert.

## Deduplication (no spam)

The first occurrence of `service:event` is sent immediately. Identical
occurrences inside `TELEGRAM_ALERT_COOLDOWN_MS` (default 15 min) are counted
and suppressed; the next send (after the cooldown) reports the aggregated
total — e.g. one "Database unavailable — Occurrences: 100" instead of 100
messages.

## What is never sent

JWT, passwords, API keys, the bot token, payment secrets, the MongoDB URI,
OAuth secrets, full payment payloads, or private customer data — only safe
identifiers (provider name, operation, event, commit sha).

## Setup (see `docs/manual-setup/09-telegram-bot.md`)

1. Create a bot with @BotFather → copy the token.
2. Message the bot / group, then read the chat id from
   `https://api.telegram.org/bot<TOKEN>/getUpdates`.
3. Add to the backend `.env` on the VPS:

```
TELEGRAM_BOT_TOKEN=123456:ABC-...
TELEGRAM_CHAT_ID=-1001234567890
TELEGRAM_ALERTS_ENABLED=true
TELEGRAM_MIN_ALERT_LEVEL=warning
TELEGRAM_ALERT_COOLDOWN_MS=900000
```

4. Restart the backend: `docker compose -f docker-compose.prod.yml up -d --force-recreate`.
5. Add the same token/chat as GitHub Actions secrets for deploy notifications.
6. Trigger a test: restart the backend — you should see the boot log
   `[notifications] Telegram alerts configured and enabled`.

**Fail-safe:** without Telegram config the backend still starts and logs
`[notifications] Telegram not configured — … disabled`. Alerting can never
take payments/orders down.
