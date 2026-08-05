import { describe, expect, it, vi } from 'vitest'

// Hermetic: force in-memory mode BEFORE the bus module is imported anywhere
// in this file (env is parsed at import time, and dotenv never overrides a
// variable that is already set).
process.env.REDIS_URL = ''

// Import at module scope (top-level await is only allowed there in ESM).
const { emitPaymentStatus, subscribePaymentStatus } = await import('./events.bus.js')

describe('events.bus — local (in-memory) delivery', () => {
  it('delivers an emitted status to a matching subscriber', () => {
    const seen: string[] = []
    const unsub = subscribePaymentStatus('ref-a', (p) => seen.push(p.status))
    emitPaymentStatus({ referenceId: 'ref-a', status: 'paid' })
    expect(seen).toEqual(['paid'])
    unsub()
  })

  it('does not deliver to subscribers of other references', () => {
    const a: string[] = []
    const b: string[] = []
    const unsubA = subscribePaymentStatus('ref-a', (p) => a.push(p.status))
    const unsubB = subscribePaymentStatus('ref-b', (p) => b.push(p.status))
    emitPaymentStatus({ referenceId: 'ref-a', status: 'scanned' })
    expect(a).toEqual(['scanned'])
    expect(b).toEqual([])
    unsubA()
    unsubB()
  })

  it('delivers to every listener on the same reference', () => {
    const one: string[] = []
    const two: string[] = []
    const unsub1 = subscribePaymentStatus('ref-a', (p) => one.push(p.status))
    const unsub2 = subscribePaymentStatus('ref-a', (p) => two.push(p.status))
    emitPaymentStatus({ referenceId: 'ref-a', status: 'paid' })
    expect(one).toEqual(['paid'])
    expect(two).toEqual(['paid'])
    unsub1()
    unsub2()
  })

  it('stops delivering after unsubscribe', () => {
    const seen: string[] = []
    const unsub = subscribePaymentStatus('ref-a', (p) => seen.push(p.status))
    emitPaymentStatus({ referenceId: 'ref-a', status: 'scanned' })
    unsub()
    emitPaymentStatus({ referenceId: 'ref-a', status: 'paid' })
    expect(seen).toEqual(['scanned'])
  })

  it('strips the internal instanceId from delivered payloads', () => {
    const seen: Array<Record<string, unknown>> = []
    const unsub = subscribePaymentStatus('ref-a', (p) => seen.push(p as unknown as Record<string, unknown>))
    emitPaymentStatus({ referenceId: 'ref-a', status: 'paid', orderId: 'o1', orderStatus: 'Processing' })
    expect(seen[0]).toEqual({ referenceId: 'ref-a', status: 'paid', orderId: 'o1', orderStatus: 'Processing' })
    expect('instanceId' in (seen[0] ?? {})).toBe(false)
    unsub()
  })
})

describe('events.bus — graceful degradation when Redis is unreachable', () => {
  it(
    'keeps local delivery working and shuts down cleanly',
    async () => {
      vi.resetModules()
      process.env.REDIS_URL = 'redis://127.0.0.1:1' // port 1 = refused instantly
      const fresh = await import('./events.bus.js')

      try {
        const seen: string[] = []
        const unsub = fresh.subscribePaymentStatus('ref-x', (p) => seen.push(p.status))
        fresh.emitPaymentStatus({ referenceId: 'ref-x', status: 'paid' })

        // Local delivery is synchronous and must NOT wait on the failed
        // Redis connect attempt (bounded to ~3s by the bus itself).
        expect(seen).toEqual(['paid'])
        unsub()

        // Give the bounded connect timeout room to settle before cleanup.
        await new Promise((r) => setTimeout(r, 4000))
      } finally {
        await fresh.shutdownRedis()
        process.env.REDIS_URL = ''
      }
    },
    20_000,
  )
})
