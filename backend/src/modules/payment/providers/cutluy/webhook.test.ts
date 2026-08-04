import { describe, expect, it } from 'vitest'
import { normalizeCutLuyEvent } from './payment.service.js'
import { verifyWebhookSignature } from './signature.js'
import { createHmac } from 'node:crypto'

/** Builds a signed webhook payload + header the way CutLuy would. */
function sign(payload: object, secret: string, t: number): { body: Buffer; header: string } {
  const body = Buffer.from(JSON.stringify(payload), 'utf8')
  const sig = createHmac('sha256', secret).update(`${t}.${body.toString('utf8')}`).digest('hex')
  return { body, header: `t=${t},v1=${sig}` }
}

const SECRET = 'test-webhook-secret-0123456789abcdef'

describe('normalizeCutLuyEvent', () => {
  it('maps payment.completed to a normalised paid event with providerPaymentId', () => {
    const raw = {
      id: 'evt_123',
      type: 'payment.completed',
      created: '2026-07-09T12:03:11.000Z',
      data: {
        payment: {
          id: 'PUETcMUOKStjZsCb6zAl8kg9fMRGM85x',
          status: 'paid',
          amount: '1.50',
          currency: 'USD',
          reference_id: 'PAY-ABC123',
          metadata: null,
          approved_at: '2026-07-09T12:03:10.000Z',
        },
      },
    }
    const event = normalizeCutLuyEvent(Buffer.from(JSON.stringify(raw), 'utf8'))

    expect(event.type).toBe('payment.completed')
    expect(event.eventId).toBe('evt_123')
    expect(event.providerPaymentId).toBe('PUETcMUOKStjZsCb6zAl8kg9fMRGM85x')
    expect(event.status).toBe('paid')
  })

  it.each([
    ['payment.scanned', 'scanned'],
    ['payment.expired', 'expired'],
    ['payment.failed', 'failed'],
  ])('maps %s → %s', (type, status) => {
    const raw = {
      id: 'evt_x',
      type,
      created: '2026-07-09T12:00:00.000Z',
      data: { payment: { id: 'pay_1', status, reference_id: 'PAY-1' } },
    }
    const event = normalizeCutLuyEvent(Buffer.from(JSON.stringify(raw), 'utf8'))
    expect(event.status).toBe(status)
  })

  it('falls back to pending for unknown event types', () => {
    const raw = { id: 'evt_y', type: 'something.else', data: { payment: { id: 'pay_2' } } }
    const event = normalizeCutLuyEvent(Buffer.from(JSON.stringify(raw), 'utf8'))
    expect(event.status).toBe('pending')
  })
})

describe('verifyWebhookSignature (end to end with signed payload)', () => {
  it('accepts a freshly signed webhook', () => {
    const payload = {
      id: 'evt_ok',
      type: 'payment.completed',
      created: '2026-07-09T12:03:11.000Z',
      data: { payment: { id: 'pay_ok', reference_id: 'PAY-OK' } },
    }
    const now = Math.floor(Date.now() / 1000)
    const { body, header } = sign(payload, SECRET, now)
    const result = verifyWebhookSignature(body, header, SECRET, now)
    expect(result.valid).toBe(true)
  })

  it('rejects a tampered body', () => {
    const now = Math.floor(Date.now() / 1000)
    const { body, header } = sign({ id: 'evt_ok', type: 'payment.completed' }, SECRET, now)
    // Tamper with the body after signing.
    body[body.length - 1] = body[body.length - 1] === 0x7d ? 0x7e : 0x7d
    const result = verifyWebhookSignature(body, header, SECRET, now)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('signature mismatch')
  })

  it('rejects a replayed (old timestamp) signature', () => {
    const payload = { id: 'evt_replay', type: 'payment.completed', data: { payment: { id: 'p' } } }
    const old = Math.floor(Date.now() / 1000) - 10 * 60 // 10 minutes ago
    const { body, header } = sign(payload, SECRET, old)
    const result = verifyWebhookSignature(body, header, SECRET)
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('replay')
  })
})
