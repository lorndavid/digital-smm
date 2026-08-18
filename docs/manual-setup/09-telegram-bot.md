# Manual Setup — Telegram Bot

> **MANUAL REQUIRED.** The code that consumes these values is CODE READY
> (`backend/src/modules/notifications/` + `scripts/notify-telegram.mjs`),
> but the bot itself must be created by you. We do not claim it was created.

## 1. Create the bot

1. Open Telegram and search for **@BotFather** (the official bot).
2. Send `/newbot`.
3. Choose a display name (e.g. `DigitalSMM Alerts`).
4. Choose a username ending in `bot` (e.g. `digitalsmm_alerts_bot`).
5. BotFather replies with a **token** like `123456789:AAH...`. Save it.

## 2. Get the chat ID

1. Open a chat with your new bot and send any message (e.g. `hi`).
2. Open in a browser:

```
https://api.telegram.org/bot<TOKEN>/getUpdates
```

3. The JSON contains `"chat":{"id":-1001234567890}` (negative number = a
   group/supergroup) or a positive number (direct chat). Copy the numeric id.

## 3. Add the values to the backend (VPS)

```bash
cd /opt/digital-smm/backend
nano .env
```

Add:

```
TELEGRAM_BOT_TOKEN=<the token from step 1>
TELEGRAM_CHAT_ID=<the id from step 2>
TELEGRAM_ALERTS_ENABLED=true
TELEGRAM_MIN_ALERT_LEVEL=warning
TELEGRAM_ALERT_COOLDOWN_MS=900000
```

Then restart the backend:

```bash
cd /opt/digital-smm
docker compose -f docker-compose.prod.yml up -d --force-recreate
sleep 8
docker compose -f docker-compose.prod.yml logs --tail=30 backend | grep notifications
```

Expected: `[notifications] Telegram alerts configured and enabled`.

## 4. Add the values to GitHub Actions (deploy notifications)

GitHub → Settings → Secrets and variables → Actions → New repository secret:
`TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` (same values).

## 5. Trigger a test alert

- Restart the backend (boot log confirms config).
- Make a deliberate failing request: `curl -X POST https://api.digitalsmm.shop/webhooks/cutluy -H "x-cutluy-signature: bogus" -d '{}'` → you should receive a ⚠️ `webhook_invalid_signature` alert (deduplicated — repeat the request 5× and you get ONE message with `Occurrences: N`).
- Or run a backend deploy from GitHub Actions → 🟡 start / 🟢 result messages.

## 6. Verify

Check the Telegram chat received the messages. If nothing arrives, re-check
the token/chat id (a common mistake is copying the id without the `-100`
prefix for groups, or using the wrong token).
