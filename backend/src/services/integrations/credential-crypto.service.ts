import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { env } from '../../config/env.js'

/**
 * Secret encryption for Admin Integrations — AES-256-GCM (authenticated
 * encryption: ciphertext + auth tag + random IV per value).
 *
 * The master key comes from CREDENTIAL_ENCRYPTION_KEY (server-only, never in
 * git, never in the database). Production REQUIRES it; development/test falls
 * back to an ephemeral in-memory key with a loud warning (credentials don't
 * survive a restart — acceptable locally).
 *
 * Wire format: `<iv>:<authTag>:<ciphertext>` — all base64. Decryption
 * throws on tampering (GCM tag verification), so a corrupted DB row can
 * never silently decrypt to garbage.
 */

let cachedKey: Buffer | null = null

function getKey(): Buffer {
  if (cachedKey) return cachedKey
  const raw = env.CREDENTIAL_ENCRYPTION_KEY
  if (raw && raw.trim().length > 0) {
    // Accept either a 64-char hex key or any passphrase (hashed to 32 bytes).
    cachedKey = /^[0-9a-fA-F]{64}$/.test(raw.trim())
      ? Buffer.from(raw.trim(), 'hex')
      : createHash('sha256').update(raw).digest()
  } else if (env.NODE_ENV === 'production') {
    throw new Error(
      'CREDENTIAL_ENCRYPTION_KEY is required in production (Admin Integrations cannot store credentials without it)',
    )
  } else {
    cachedKey = randomBytes(32)
    // eslint-disable-next-line no-console
    console.warn(
      '[credentials] CREDENTIAL_ENCRYPTION_KEY not set — using an ephemeral development key. Stored credentials will be undecryptable after restart.',
    )
  }
  return cachedKey
}

/** Encrypts a plaintext secret. Returns `iv:tag:ciphertext` (base64 parts). */
export function encryptSecret(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`
}

/** Decrypts a value produced by `encryptSecret`. Throws on tamper/bad format. */
export function decryptSecret(payload: string): string {
  const key = getKey()
  const parts = payload.split(':')
  if (parts.length !== 3) throw new Error('Invalid encrypted credential payload')
  const ivB64 = parts[0]!
  const tagB64 = parts[1]!
  const dataB64 = parts[2]!
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ])
  return decrypted.toString('utf8')
}

/** Returns true when the value is non-empty and decrypts cleanly. */
export function isDecryptable(payload: string): boolean {
  try {
    decryptSecret(payload)
    return true
  } catch {
    return false
  }
}

/**
 * Masks a secret for display: bullets, optionally revealing the last
 * `reveal` characters (e.g. chat ID → ••••••••7890). Never returns the
 * plaintext.
 */
export function maskSecret(value: string | null | undefined, reveal = 0): string | null {
  if (!value) return null
  const bullets = '•'.repeat(12)
  if (reveal <= 0 || value.length <= reveal) return bullets
  return bullets + value.slice(-reveal)
}
