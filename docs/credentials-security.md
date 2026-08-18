# Credentials Security

How the Admin Integrations feature keeps provider credentials safe, and how to
verify it stays that way.

## Encryption at rest

```
Plaintext API key
      │  encryptSecret()  — AES-256-GCM, random 12-byte IV per value
      ▼
"<iv>:<authTag>:<ciphertext>"  (base64)
      │  stored in MongoDB `integrationcredentials.secrets.*`
      ▼
Only decryptSecret() (backend, in memory) can recover the value
```

- Key: `CREDENTIAL_ENCRYPTION_KEY` from `backend/.env` (hashed to a 32-byte key;
  a 64-char hex value is used directly).
- **Production requires it** — without it the server exits at boot with a clear
  message, so credentials can never be stored with a throwaway key.
- GCM authenticates the ciphertext: a tampered or corrupted row fails
  decryption instead of silently decrypting to garbage.
- The key is never stored in MongoDB and never committed to git.

## What the browser can see

Every API response passes through `toSafeView()` (unit-tested). Secret fields
appear ONLY as:

```json
"botToken": { "configured": true, "masked": "••••••••••••" }
"chatId":   { "configured": true, "masked": "••••••••••••7890" }
```

- There is no endpoint that returns a decrypted secret.
- Masked previews are computed server-side; for chat IDs the tail of the
  *decrypted* value is shown so the admin can verify the ID.
- The admin never stores credentials in Pinia / localStorage / cookies — the
  UI keeps only the safe view it fetched.

## Log redaction

`backend/src/utils/redact.ts` scrubs every `logger.*` meta object:

- Keys matching sensitive names are replaced wholesale:
  `authorization`, `cookie`, `password`, `secret`, `apiKey`, `apiSecret`,
  `accessToken`, `refreshToken`, `clientSecret`, `privateKey`, `botToken`,
  `chatId`, `webhookSecret`, `credential` (and common plurals).
- Credential-shaped strings are redacted even under innocent keys (Telegram
  `123456789:AA…` tokens, long hex/base64 blobs).

Audit entries (`integration.save`, `integration.test`, …) store only action,
provider, actor and safe details — never secret values.

## Deletion & lifecycle

- **Delete** removes the encrypted row (confirm dialog in the UI; audited).
- **Disable** keeps credentials stored but marks the integration unusable by
  jobs/services.
- Replacing a secret encrypts the new value over the old; the plaintext is
  never written to disk or logs.

## Verification checklist

- [ ] API responses contain no plaintext secrets (grep the network tab for
      your token after saving).
- [ ] MongoDB stores only `<iv>:<tag>:<ciphertext>` strings — run
      `db.integrationcredentials.find()` and confirm no readable keys.
- [ ] `CREDENTIAL_ENCRYPTION_KEY` exists in `backend/.env` on the VPS and
      nowhere else.
- [ ] Server logs never contain the token/key (the logger redacts by default).
- [ ] Non-admins get 401 on `/api/admin/integrations*`.
- [ ] `.env` / `.env.production` are gitignored; the repo contains only the
      `.example` templates.

## Tests

- `credential-crypto.test.ts` — round-trip, tamper rejection, masking.
- `integration-view.test.ts` — safe view never leaks secrets; keep/clear/
  replace semantics; status logic.
- `telegram.adapter.test.ts` / `smm.adapter.test.ts` — real API flows with
  mocked HTTP, error normalization.
- `redact.test.ts` — logger redaction rules.
