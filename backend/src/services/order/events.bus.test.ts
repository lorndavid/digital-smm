import { describe, expect, it, vi } from 'vitest'

// Hermetic: force in-memory mode BEFORE the bus module is imported anywhere
// in this file (env is parsed at import time, and dotenv never overrides a
// variable that is already set).
process.env.REDIS_URL = ''

// Import at module scope (top-level await is only allowed there in ESM).
const { emitOrderStatus, subscribeOrderStatus } = await import('./events.bus.js')

describe('order events.bus — local (in-memory) delivery', () => {
  it('delivers an emitted status to a matching subscriber', () => {
    const seen: string[] = []
    const unsub = subscribeOrderStatus('user-1', (p) => seen.push(p.status ?? ''))
    emitOrderStatus({ userId: 'user-1', orderId: 'o1', status: 'Completed' })
    expect(seen).toEqual(['Completed'])
    unsub()
  })

  it('does not deliver to subscribers of other users', () => {
    const a: string[] = []
    const b: string[] = []
    const unsubA = subscribeOrderStatus('user-1', (p) => a.push(p.orderId))
    const unsubB = subscribeOrderStatus('user-2', (p) => b.push(p.orderId))
    emitOrderStatus({ userId: 'user-1', orderId: 'o1', status: 'In progress' })
    expect(a).toEqual(['o1'])
    expect(b).toEqual([])
    unsubA()
    unsubB()
  })

  it('delivers to every listener on the same user', () => {
    const one: string[] = []
    const two: string[] = []
    const unsub1 = subscribeOrderStatus('user-1', (p) => one.push(p.status ?? ''))
    const unsub2 = subscribeOrderStatus('user-1', (p) => two.push(p.status ?? ''))
    emitOrderStatus({ userId: 'user-1', orderId: 'o1', status: 'Completed' })
    expect(one).toEqual(['Completed'])
    expect(two).toEqual(['Completed'])
    unsub1()
    unsub2()
  })

  it('stops delivering after unsubscribe', () => {
    const seen: string[] = []
    const unsub = subscribeOrderStatus('user-1', (p) => seen.push(p.status ?? ''))
    emitOrderStatus({ userId: 'user-1', orderId: 'o1', status: 'Partial' })
    unsub()
    emitOrderStatus({ userId: 'user-1', orderId: 'o1', status: 'Completed' })
    expect(seen).toEqual(['Partial'])
  })

  it('strips the internal instanceId from delivered payloads', () => {
    const seen: Array<Record<string, unknown>> = []
    const unsub = subscribeOrderStatus('user-1', (p) =>
      seen.push(p as unknown as Record<string, unknown>),
    )
    emitOrderStatus({ userId: 'user-1', orderId: 'o1', orderNumber: 10001, status: 'Processing', remains: 5 })
    expect(seen[0]).toEqual({
      userId: 'user-1',
      orderId: 'o1',
      orderNumber: 10001,
      status: 'Processing',
      remains: 5,
    })
    expect('instanceId' in (seen[0] ?? {})).toBe(false)
    unsub()
  })
})

describe('order events.bus — graceful degradation when Redis is unreachable', () => {
  it(
    'keeps local delivery working and shuts down cleanly',
    async () => {
      vi.resetModules()
      process.env.REDIS_URL = 'redis://127.0.0.1:1' // port 1 = refused instantly
      const fresh = await import('./events.bus.js')

      try {
        const seen: string[] = []
        const unsub = fresh.subscribeOrderStatus('user-x', (p) => seen.push(p.status ?? ''))
        fresh.emitOrderStatus({ userId: 'user-x', orderId: 'o1', status: 'Completed' })

        // Local delivery is synchronous and must NOT wait on the failed
        // Redis connect attempt (bounded to ~0.5s by the bus itself).
        expect(seen).toEqual(['Completed'])
        unsub()

        // Give the bounded connect timeout room to settle before cleanup.
        await new Promise((r) => setTimeout(r, 4000))
      } finally {
        await fresh.shutdownOrderRedis()
        process.env.REDIS_URL = ''
      }
    },
    20_000,
  )
})
