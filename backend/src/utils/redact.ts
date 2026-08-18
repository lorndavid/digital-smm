/**
 * Global secret redaction for logs.
 *
 * Recursively replaces values under sensitive key names with `[REDACTED]`
 * so an accidental `logger.info(..., { botToken, apiKey, authorization })`
 * can never leak a credential into the log stream. Applied in
 * utils/logger.ts to every `meta` object.
 *
 * Also redacts common credential-shaped values (long hex/base64 secrets,
 * Telegram `123456:ABC…` bot tokens) wherever they appear, key or not.
 */

/**
 * Exact-match (normalized) sensitive key names — e.g. `api_key`, `apiKey`,
 * `client-secret` all normalize to `apikey`/`clientsecret`. Exact matching
 * avoids over-redaction: `credentials` (a config object) stays visible while
 * any `apiKey` inside it is still scrubbed.
 */
const SENSITIVE_KEYS = new Set([
  'authorization',
  'cookie',
  'setcookie',
  'password',
  'passwd',
  'secret',
  'apikey',
  'apisecret',
  'accesstoken',
  'refreshtoken',
  'clientsecret',
  'privatekey',
  'bottoken',
  'chatid',
  'webhooksecret',
  'credential',
])

const REDACTED = '[REDACTED]'

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Exact match, plus common plurals (`secrets` → `secret`). */
function isSensitiveKey(key: string): boolean {
  const k = normalizeKey(key)
  if (SENSITIVE_KEYS.has(k)) return true
  if (k.length > 3 && k.endsWith('s')) return SENSITIVE_KEYS.has(k.slice(0, -1))
  return false
}

/** True when `value` looks like a credential (token/secret-shaped string). */
function looksLikeSecret(value: string): boolean {
  if (value.length < 16) return false
  // Telegram bot token: 123456789:AA...35+ chars
  if (/^\d{6,}:[A-Za-z0-9_-]{30,}$/.test(value)) return true
  // Long hex / base64 / base64url blobs.
  if (/^[A-Za-z0-9+/=_\-]{32,}$/.test(value) && /[A-Za-z0-9]{32,}/.test(value)) return true
  return false
}

/** Deep-redacts an unknown value. Returns a JSON-safe copy. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[MAX_DEPTH]'
  if (value === null || value === undefined) return value
  if (typeof value === 'string') {
    return looksLikeSecret(value) ? REDACTED : value
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (value instanceof Error) {
    return {
      message: redact(value.message, depth + 1),
      name: value.name,
    }
  }
  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1))
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSensitiveKey(key) ? REDACTED : redact(val, depth + 1)
    }
    return out
  }
  return value
}
