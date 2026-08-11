import { describe, expect, it } from 'vitest'
import { buildMockKhqr } from './khqr.util.js'

describe('buildMockKhqr', () => {
  it('is deterministic for identical inputs', () => {
    const a = buildMockKhqr({ merchant: 'DIGITALSMM', reference: 'PAY-ABC', amount: 5.5, currency: 'USD' })
    const b = buildMockKhqr({ merchant: 'DIGITALSMM', reference: 'PAY-ABC', amount: 5.5, currency: 'USD' })
    expect(a).toBe(b)
  })

  it('embeds the merchant, reference and fixed amount', () => {
    const qr = buildMockKhqr({ merchant: 'DIGITALSMM', reference: 'PAY-123', amount: 12.3, currency: 'USD' })
    const decoded = Buffer.from(qr, 'base64url').toString('utf8')
    expect(decoded).toContain('merchant=DIGITALSMM')
    expect(decoded).toContain('ref=PAY-123')
    expect(decoded).toContain('amount=12.30')
    expect(decoded).toContain('currency=USD')
  })

  it('produces a base64url-safe string', () => {
    const qr = buildMockKhqr({ merchant: 'DIGITALSMM', reference: 'PAY-1', amount: 1, currency: 'USD' })
    expect(qr).toMatch(/^[A-Za-z0-9_-]+$/)
  })
})
