import { describe, expect, it, vi } from 'vitest'

vi.mock('../../config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    CREDENTIAL_ENCRYPTION_KEY: 'a'.repeat(64),
    INTEGRATION_HEALTH_INTERVAL_MS: 1_800_000,
    ENABLE_INTEGRATION_HEALTH_JOB: true,
  },
  corsOrigins: [],
}))

import { decryptSecret, encryptSecret, isDecryptable, maskSecret } from './credential-crypto.service.js'

describe('credential crypto (AES-256-GCM)', () => {
  it('round-trips a secret', () => {
    const payload = encryptSecret('123456789:ABCdefGHIjkLMNOPqrsTUVwxyz0123456789ab')
    expect(payload).not.toContain('123456789')
    expect(payload.split(':')).toHaveLength(3)
    expect(decryptSecret(payload)).toBe('123456789:ABCdefGHIjkLMNOPqrsTUVwxyz0123456789ab')
  })

  it('produces a different ciphertext for the same plaintext (random IV)', () => {
    const a = encryptSecret('same-secret-value')
    const b = encryptSecret('same-secret-value')
    expect(a).not.toBe(b)
    expect(decryptSecret(a)).toBe(decryptSecret(b))
  })

  it('never stores the plaintext in the wire format', () => {
    const plaintext = 'my-very-secret-api-key-123456'
    expect(encryptSecret(plaintext)).not.toMatch(/my-very-secret/)
  })

  it('rejects tampered ciphertext (GCM auth tag)', () => {
    const payload = encryptSecret('tamper-me')
    const parts = payload.split(':')
    const tampered = [parts[0], parts[1], Buffer.from('AAAA').toString('base64')].join(':')
    expect(() => decryptSecret(tampered)).toThrow()
  })

  it('rejects garbage payloads', () => {
    expect(() => decryptSecret('not-a-valid-payload')).toThrow()
  })

  it('isDecryptable reports validity without throwing', () => {
    const payload = encryptSecret('check-me')
    expect(isDecryptable(payload)).toBe(true)
    expect(isDecryptable('garbage')).toBe(false)
  })
})

describe('maskSecret', () => {
  it('returns null for empty values', () => {
    expect(maskSecret(null)).toBeNull()
    expect(maskSecret('')).toBeNull()
    expect(maskSecret(undefined)).toBeNull()
  })

  it('masks fully by default', () => {
    const masked = maskSecret('abc123')
    expect(masked).toBe('••••••••••••')
    expect(masked).not.toContain('abc')
  })

  it('reveals only the last N characters', () => {
    expect(maskSecret('-1001234567890', 4)).toBe('••••••••••••7890')
    expect(maskSecret('123456', 6)).toBe('••••••••••••')
  })

  it('never reveals more than the tail', () => {
    const masked = maskSecret('super-secret-token-xyz', 4)
    expect(masked).not.toContain('super')
    expect(masked!.endsWith('xyz')).toBe(true)
  })
})
