# Admin → Integrations & API Credentials

The integrations system lets an administrator manage external service credentials
from the dashboard — **without editing `.env` files** — while keeping secrets
encrypted at rest and never visible to the browser.

Providers today:

| Provider      | Key        | Purpose                                        | Connection test                |
|---------------|------------|------------------------------------------------|--------------------------------|
| Telegram      | `telegram` | Bot publishing, alerts, test messages. Multiple destinations (personal chats, groups, supergroups, channels) on one integration. | ✅ real Bot API (`getMe` + `getChat` per destination, `getUpdates` fallback for private chats) |
| SMM Provider  | `smm`      | Social media order fulfilment API              | ✅ real `balance` call (wizsmm client) |
| Culture API   | `culture`  | Translation / language service                 | ⏳ adapter interface ready, no documented endpoint yet |

---

## Architecture

```
Admin UI (Vue)
   │  safe views only (configured / masked / status)
   ▼
Admin API (/api/admin/integrations…, admin JWT required)
   │
   ▼
integration.service  ── encrypt/decrypt (AES-256-GCM, CREDENTIAL_ENCRYPTION_KEY)
   │
   ├── IntegrationCredential (MongoDB — encrypted secret columns)
   ├── adapters/telegram.adapter  → api.telegram.org (real)
   ├── adapters/smm.adapter       → reuses services/smm/smmwiz.provider.ts
   └── adapters/culture.adapter   → interface-only (no fabricated endpoints)
```

Layers:

- **`services/integrations/integration.types.ts`** — provider registry + field
  metadata. Adding a provider = add a key, describe its fields, register an adapter.
- **`services/integrations/credential-crypto.service.ts`** — AES-256-GCM
  encrypt/decrypt/mask. Key from `CREDENTIAL_ENCRYPTION_KEY` (server-only).
- **`services/integrations/integration.service.ts`** — CRUD, enable/disable,
  connection tests, history. The only module that touches secrets.
- **`services/integrations/integration-view.ts`** — pure safe-view serialization
  (unit-tested; the security boundary for API responses).
- **`jobs/integration-health.job.ts`** — background health probes (default every
  30 min, single-owner via Mongo distributed lock).

---

## Security model

- **Encryption at rest** — secret values are stored ONLY as AES-256-GCM
  ciphertext (`iv:authTag:ciphertext`, base64). Plaintext never reaches MongoDB.
- **`CREDENTIAL_ENCRYPTION_KEY`** — the master key lives in `backend/.env` on the
  VPS only. It is **required in production** (the server refuses to boot without
  it) and **never** stored in the database or committed to git. Generate:
  `openssl rand -hex 32`. Losing it makes stored credentials undecryptable.
- **No secrets in API responses** — `GET /admin/integrations` returns only
  `{ configured, masked }` per secret field (e.g. `••••••••••••7890`). There is
  no "show token" endpoint and no plaintext round-trip.
- **Secret update semantics** — saving an integration with a secret field
  *omitted* keeps the existing encrypted value; an empty string clears it; a new
  value encrypts and replaces it.
- **No secrets in logs** — `utils/logger.ts` redacts credential-shaped values
  and sensitive keys globally (`authorization`, `token`, `apiKey`, `botToken`,
  `chatId`, …). Audit entries store only action + provider + actor.
- **Organization boundary** — every query filters by `organizationId` resolved
  server-side (currently the single-tenant constant `default`). Client-supplied
  organization IDs are never trusted. See `integration.service.ts` for the
  multi-tenant extension point.
- **Auth** — all routes sit behind the existing `adminOnly` JWT guard (same
  middleware as every other admin route). Connection tests are rate-limited
  (5/min per admin) so a user can't hammer a provider API.

---

## API routes

All under `/api`, admin JWT required.

| Method | Route                                      | Description                                        |
|--------|--------------------------------------------|----------------------------------------------------|
| GET    | `/admin/integrations`                      | Safe views for every registered provider           |
| GET    | `/admin/integrations/:provider`            | Safe view for one provider                         |
| PUT    | `/admin/integrations/:provider`            | Create/update (secrets: omit = keep, `''` = clear) |
| DELETE | `/admin/integrations/:provider`            | Remove the credential                              |
| POST   | `/admin/integrations/:provider/enable`     | Body `{ enabled: boolean }`                        |
| POST   | `/admin/integrations/:provider/test`       | Run a real connection test (rate-limited)          |
| POST   | `/admin/integrations/telegram/test-message`| Send a test message (rate-limited)                 |

Provider key values: `telegram`, `smm`, `culture`.

Safe response shape (example):

```json
{
  "provider": "telegram",
  "configured": true,
  "enabled": true,
  "status": "CONNECTED",
  "lastTestedAt": "2026-08-18T05:00:00Z",
  "latencyMs": 284,
  "credentials": {
    "botToken": { "configured": true, "masked": "••••••••••••" },
    "chatId":   { "configured": true, "masked": "••••••••••••7890" }
  },
  "config": { "destinationType": "supergroup" },
  "connectionHistory": [ { "testedAt": "…", "success": true, "latencyMs": 284, "errorCode": "" } ]
}
```

Test result (never contains secrets):

```json
{ "success": true, "provider": "telegram", "status": "CONNECTED", "latencyMs": 284,
  "checkedAt": "…", "details": { "bot": { "username": "@example_bot" },
  "destination": { "type": "supergroup", "available": true } } }
```

Normalized error codes: `INVALID_CREDENTIALS`, `UNAUTHORIZED`, `FORBIDDEN`,
`RATE_LIMITED`, `TIMEOUT`, `NETWORK_ERROR`, `INVALID_DESTINATION`,
`PROVIDER_UNAVAILABLE`, `NOT_CONFIGURED`, `UNSUPPORTED`, `UNKNOWN_ERROR`.

---

## Statuses

| Status             | Meaning                                                          |
|--------------------|------------------------------------------------------------------|
| `CONNECTED`        | Configured + last test succeeded (Telegram: bot + every destination verified). |
| `NOT_CONFIGURED`   | No credentials saved yet.                                        |
| `CONNECTION_FAILED`| Configured but the last test failed (see `lastErrorCode`).       |
| `DISABLED`         | Stored but disabled by an admin — unusable by jobs/services.     |
| `TESTING`          | Transient — a test is in flight.                                 |
| `EXPIRED`          | Reserved for future expiry handling.                             |

---

## Environment variables

```env
# backend/.env (production REQUIRED)
CREDENTIAL_ENCRYPTION_KEY=<openssl rand -hex 32>

# Background health probes (defaults shown)
ENABLE_INTEGRATION_HEALTH_JOB=true
INTEGRATION_HEALTH_INTERVAL_MS=1800000
```

In development `CREDENTIAL_ENCRYPTION_KEY` may be empty — the backend generates
an ephemeral in-memory key (credentials won't survive a restart).

---

## Admin UI

- **`/integrations`** — provider cards with live status, last-tested time,
  Test Connection shortcut.
- **`/integrations/:provider`** — configuration form, masked secret fields with
  a "Replace" flow, connection test with progress steps (Telegram), test message
  (Telegram), connection history, and a danger zone (enable/disable, delete).
- Dashboard widget — "Integration Health" with one row per provider.

Forms are rendered from provider metadata (`admin/src/utils/integrations.ts`,
mirroring the backend registry), so new providers need no new UI code.

---

## Background health checks

`jobs/integration-health.job.ts` pings each configured + enabled integration
every 30 minutes with the lightest possible probe (Telegram `getMe`, SMM
`balance`; Culture skipped — no adapter probe yet). A per-provider Mongo
distributed lock guarantees a single owner across replicas, and the job never
writes to the credential document (manual tests own the history).

---

## Future providers

Add a provider in four places:

1. `INTEGRATION_PROVIDER_KEYS` + `INTEGRATION_PROVIDERS` metadata
   (`backend/src/services/integrations/integration.types.ts`).
2. An adapter in `backend/src/services/integrations/adapters/` registered in
   `runAdapterTest` (`integration.service.ts`).
3. A mirror entry in `admin/src/utils/integrations.ts` for the form.
4. (Optional) a secret column in `models/integration-credential.model.ts` if
   the provider needs a new secret field type.

See also: [telegram.md](telegram.md), [smm-provider.md](smm-provider.md),
[credentials-security.md](credentials-security.md).
