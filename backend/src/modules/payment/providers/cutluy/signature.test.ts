import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  parseSignatureHeader,
  signaturesMatch,
  verifyWebhookSignature,
} from './signature.js'

const SECRET = 'whsec_test_123'
const BODY = Buffer.from(JSON.stringify({ id: 'evt_1', type: 'payment.completed' }))

function sign(secret: string, t: number, body: Buffer): string {
  const digest = createHmac('sha256', secret).update(`${t}.${body.toString('utf8')}`).digest('hex')
  return `t=${t},v1=${digest}`
}

const now = Math.floor(Date.now() / 1000)

describe('verifyWebhookSignature', () => {
  it('accepts a fresh, correctly signed body', () => {
    const result = verifyWebhookSignature(BODY, sign(SECRET, now, BODY), SECRET, now)
    expect(result.valid).toBe(true)
  })

  it('rejects a tampered body', () => {
    const tampered = Buffer.from('{"id":"evt_1","type":"payment.failed"}')
    const result = verifyWebhookSignature(tampered, sign(SECRET, now, BODY), SECRET, now)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('signature mismatch')
  })

  it('rejects an old timestamp (replay protection)', () => {
    const old = now - 400 // > 5 minutes
    const result = verifyWebhookSignature(BODY, sign(SECRET, old, BODY), SECRET, now)
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('too old')
  })

  it('rejects a signature produced with the wrong secret', () => {
    const result = verifyWebhookSignature(BODY, sign('wrong_secret', now, BODY), SECRET, now)
    expect(result.valid).toBe(false)
  })

  it('rejects a missing header', () => {
    const result = verifyWebhookSignature(BODY, undefined, SECRET, now)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('missing signature header')
  })

  it('rejects when no secret is configured', () => {
    const result = verifyWebhookSignature(BODY, sign(SECRET, now, BODY), '', now)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('webhook secret not configured')
  })
})

describe('parseSignatureHeader', () => {
  it('parses t and v1 parts', () => {
    const parts = parseSignatureHeader(`t=${now},v1=abcdef`)
    expect(parts.t).toBe(now)
    expect(parts.v1).toBe('abcdef')
  })

  it('throws on malformed headers', () => {
    expect(() => parseSignatureHeader('not-a-signature')).toThrow()
  })
})

describe('signaturesMatch', () => {
  it('compares in constant time and rejects mismatches / length differences', () => {
    expect(signaturesMatch('abcd', 'abcd')).toBe(true)
    expect(signaturesMatch('abcd', 'abce')).toBe(false)
    expect(signaturesMatch('abcd', 'abc')).toBe(false)
  })
})
