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
2. **Add the bot to each destination** — invite the bot into the group/channel
   and grant it the permissions it needs (for a channel: make it an admin;
   for a group: it must be a member). For a **personal chat**, the recipient
   must open the bot and press **Start** (send any message) once.
3. **Find the destination Chat IDs**:
   - Message the bot, then call
     `https://api.telegram.org/bot<TOKEN>/getUpdates` and read the numeric
     `chat.id` from the JSON.
   - Or use @userinfobot / @getidsbot to look up the ID of any chat.
4. Open **Admin → Integrations → Telegram**.
5. Enter the **Bot Token** (shown masked after save).
6. Under **Destinations**, add every chat the bot should reach — you can list
   several **personal chats** plus a **group**, a **supergroup** and a
   **channel** at the same time. Each row has its own Chat ID + type.
7. **Save Changes**.
8. **Test Connection** — the backend validates the bot (`getMe`) then **every
   destination** (`getChat`) and shows a per-destination breakdown with
   latency. A personal chat that the user hasn't started yet is detected via
   `getUpdates` and reported with a clear "press Start" message.
9. Optional: **Send Test Message** — sends to **all** destinations and shows
   one result per chat.

---

## Chat ID formats

| Destination | Format                | Example         |
|-------------|-----------------------|-----------------|
| Private chat| numeric id (**positive**) | `123456789` |
| Group       | negative id           | `-1234567890`   |
| Supergroup  | `-100…` id            | `-1001234567890`|
| Channel     | `-100…` id or @handle | `@digitalsmm_news` |

The system stores the ID exactly as entered (validation only checks the shape:
numeric — positive **or** negative — or `@username`). The type is stored per
destination and used by the UI — the real check happens at test time via the
Telegram API.

## Personal chats (the "Start" rule)

Telegram only lets a bot see/send to a private chat after that user has
messaged the bot. Consequences:

- The first **Test Connection** on a personal chat may report
  `INVALID_DESTINATION` **until the recipient presses Start** on the bot.
- This is not a bug — the backend automatically scans `getUpdates` and, once
  the user presses Start, the same test passes. The error message tells you
  exactly what to do.
- After the user starts the bot, the admin-managed integration can message
  them like any other destination.

---

## What a test does

```
Admin clicks Test
  → backend loads encrypted credentials, decrypts in memory
  → GET  api.telegram.org/bot<TOKEN>/getMe        (validates token)
  → for EACH destination: GET .../getChat         (validates chat)
       → private chat not found? scan getUpdates  (Start pressed?)
  → updates status + connection history + latency
  → returns ONLY safe info: bot username, per-destination masked results
```

The token is never returned, logged, or stored in plaintext. The adapter lives
in `backend/src/services/integrations/adapters/telegram.adapter.ts` and exposes
`validateTelegramBot`, `validateTelegramDestination`,
`validateTelegramDestinations`, `sendTelegramMessage`, `sendTelegramMessageToAll`
— the building blocks for future publishing features (sendPhoto, sendDocument,
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
