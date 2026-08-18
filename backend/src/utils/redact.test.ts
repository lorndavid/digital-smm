import { describe, expect, it } from 'vitest'
import { redact } from './redact.js'

describe('log redaction', () => {
  it('redacts values under sensitive keys', () => {
    const out = redact({
      botToken: '123456789:ABCdefGHIjkLMNOPqrsTUVwxyz0123456789ab',
      apiKey: 'sk-live-abc',
      password: 'hunter2',
      authorization: 'Bearer abc',
      normal: 'keep me',
    }) as Record<string, unknown>

    expect(out.botToken).toBe('[REDACTED]')
    expect(out.apiKey).toBe('[REDACTED]')
    expect(out.password).toBe('[REDACTED]')
    expect(out.authorization).toBe('[REDACTED]')
    expect(out.normal).toBe('keep me')
  })

  it('redacts token-shaped strings even under non-sensitive keys', () => {
    const out = redact({ value: '123456789:ABCdefGHIjkLMNOPqrsTUVwxyz0123456789ab' }) as Record<string, unknown>
    expect(out.value).toBe('[REDACTED]')
  })

  it('redacts nested structures', () => {
    const out = redact({ provider: { connection: { apiKey: 'abcdefghijklmnopqrstuvwxyz0123456789' } } }) as {
      provider: { connection: { apiKey: unknown } }
    }
    expect(out.provider.connection.apiKey).toBe('[REDACTED]')
  })

  it('redacts whole subtrees under sensitive keys', () => {
    const out = redact({ provider: { secrets: { anything: 'deep-value' } } }) as {
      provider: Record<string, unknown>
    }
    // The `secrets` key itself is sensitive → its value is fully replaced.
    expect(out.provider.secrets).toBe('[REDACTED]')
    expect(JSON.stringify(out)).not.toContain('deep-value')
  })

  it('does not over-redact non-sensitive container keys', () => {
    const out = redact({
      provider: { details: { username: 'admin', apiKey: 'abcdefghijklmnopqrstuvwxyz0123456789' } },
    }) as { provider: { details: { username: unknown; apiKey: unknown } } }
    // Container stays, sensitive leaf is scrubbed.
    expect(out.provider.details.username).toBe('admin')
    expect(out.provider.details.apiKey).toBe('[REDACTED]')
  })

  it('redacts errors (message preserved, stack redacted for safety)', () => {
    const out = redact(new Error('boom')) as { message: string; name: string }
    expect(out.message).toBe('boom')
    expect(out.name).toBe('Error')
  })

  it('leaves short harmless strings untouched', () => {
    const out = redact({ name: 'admin', count: 3, ok: true }) as Record<string, unknown>
    expect(out.name).toBe('admin')
    expect(out.count).toBe(3)
    expect(out.ok).toBe(true)
  })
})
