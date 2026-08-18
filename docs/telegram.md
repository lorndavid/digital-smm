# Telegram Integration

Configure and test a Telegram bot from **Admin → Integrations → Telegram**.
Credentials (bot token, chat ID) are encrypted before storage and never shown
again after saving.

> This is the **runtime** integration (Admin → Integrations). Operational
> alerts (deploy notifications, daily report) use separate environment
> variables (`TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` in `backend/.env`).
> Both can be configured independently; the admin-managed credentials do not
> change what the alert system reads.

---

## Admin workflow

1. **Create the bot** — message [@BotFather](https://t.me/BotFather) →
   `/newbot` → copy the token. The token looks like
   `123456789:AAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`.
2. **Add the bot to the destination** — invite the bot into the group/channel
   and grant it the permissions it needs (for a channel: make it an admin;
   for a group: it must be a member).
3. **Find the destination Chat ID**:
   - Message the bot, then call
     `https://api.telegram.org/bot<TOKEN>/getUpdates` and read the numeric
     `chat.id` from the JSON.
   - Or use @userinfobot / @getidsbot to look up the ID of any chat.
4. Open **Admin → Integrations → Telegram**.
5. Enter the **Bot Token** (shown masked after save).
6. Enter the **Destination Chat ID** and pick the **Destination Type**.
7. **Save Changes**.
8. **Test Connection** — the backend validates the bot (`getMe`) then the
   destination (`getChat`) and reports latency + destination type.
9. Optional: **Send Test Message** to verify delivery end-to-end.

---

## Chat ID formats

| Destination | Format                | Example         |
|-------------|-----------------------|-----------------|
| Private chat| numeric id            | `123456789`     |
| Group       | negative id           | `-1234567890`   |
| Supergroup  | `-100…` id            | `-1001234567890`|
| Channel     | `-100…` id or @handle | `@digitalsmm_news` |

The system stores the ID exactly as entered (validation only checks the shape:
numeric or `@username`). The destination type is saved as metadata and used by
the UI — the real check happens at test time via the Telegram API.

---

## What a test does

```
Admin clicks Test
  → backend loads encrypted credentials, decrypts in memory
  → GET  api.telegram.org/bot<TOKEN>/getMe        (validates token)
  → GET  api.telegram.org/bot<TOKEN>/getChat      (validates destination)
  → updates status + connection history + latency
  → returns ONLY safe info: bot username, destination type, latency
```

The token is never returned, logged, or stored in plaintext. The adapter lives
in `backend/src/services/integrations/adapters/telegram.adapter.ts` and exposes
`validateTelegramBot`, `validateTelegramDestination`, `sendTelegramMessage` —
the building blocks for future publishing features (sendPhoto, sendDocument,
publishPost).

---

## Normalized error messages

| Error code             | Typical cause                                              |
|------------------------|------------------------------------------------------------|
| `INVALID_CREDENTIALS`  | Wrong/revoked bot token (Telegram 401).                    |
| `INVALID_DESTINATION`  | Chat ID not found — bot not in the chat, or ID mistyped.   |
| `FORBIDDEN`            | Bot lacks permission to read/write the destination.        |
| `RATE_LIMITED`         | Telegram throttled the request (429) — wait and retry.     |
| `TIMEOUT` / `NETWORK_ERROR` | Telegram unreachable from the VPS.                    |

See [credentials-security.md](credentials-security.md) for the storage model.
