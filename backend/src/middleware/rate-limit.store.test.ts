import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createClient } from 'redis'
import type { RedisClientType } from 'redis'
import { DistributedRateLimitStore } from './rate-limit.store.js'
import type { RateLimitRedisClient } from './rate-limit.store.js'
import type { Options } from 'express-rate-limit'

/** Minimal in-memory Redis stand-in that faithfully mimics the commands the
 *  store uses (INCR/PEXPIRE/PTTL/DECR/DEL/GET/SCAN with real TTL expiry). */
class FakeRedis implements RateLimitRedisClient {
  private data = new Map<string, { value: number; expiresAt: number }>()

  private entry(key: string): { value: number; expiresAt: number } | undefined {
    const e = this.data.get(key)
    if (!e) return undefined
    if (e.expiresAt !== -1 && e.expiresAt <= Date.now()) {
      this.data.delete(key)
      return undefined
    }
    return e
  }

  async get(key: string): Promise<string | null> {
    const e = this.entry(key)
    return e ? String(e.value) : null
  }

  async incr(key: string): Promise<number> {
    const e = this.entry(key)
    if (!e) {
      this.data.set(key, { value: 1, expiresAt: -1 })
      return 1
    }
    e.value += 1
    return e.value
  }

  async pExpire(key: string, milliseconds: number): Promise<boolean> {
    const e = this.entry(key)
    if (!e) return false
    e.expiresAt = Date.now() + milliseconds
    return true
  }

  async pTTL(key: string): Promise<number> {
    const e = this.entry(key)
    if (!e) return -2
    if (e.expiresAt === -1) return -1
    return Math.max(1, e.expiresAt - Date.now())
  }

  async decr(key: string): Promise<number> {
    const e = this.entry(key)
    if (!e) {
      this.data.set(key, { value: -1, expiresAt: -1 })
      return -1
    }
    e.value -= 1
    return e.value
  }

  async del(key: string): Promise<number> {
    return this.data.delete(key) ? 1 : 0
  }

  async *scanIterator(options: { MATCH: string; COUNT: number }): AsyncIterable<string[]> {
    const prefix = options.MATCH.replace('*', '')
    const page = [...this.data.keys()].filter((k) => k.startsWith(prefix))
    yield page
  }
}

/** Throws on every command — exercises the per-request error fallback. */
class ThrowingRedis implements RateLimitRedisClient {
  private async boom(): Promise<never> {
    throw new Error('connection lost')
  }
  get = () => this.boom()
  incr = () => this.boom()
  pExpire = () => this.boom()
  pTTL = () => this.boom()
  decr = () => this.boom()
  del = () => this.boom()
  scanIterator = () => this.boom() as unknown as AsyncIterable<string[]>
}

const opts = (windowMs: number): Options => ({ windowMs } as Options)

function initStore(store: DistributedRateLimitStore, windowMs = 1000): void {
  store.init(opts(windowMs))
}

describe('DistributedRateLimitStore — Redis path (fake client)', () => {
  let redis: FakeRedis

  beforeEach(() => {
    redis = new FakeRedis()
  })

  it('counts hits within a fixed window and reports a resetTime', async () => {
    const store = new DistributedRateLimitStore('vidsmm:rl:t1:', () => Promise.resolve(redis))
    initStore(store, 60_000)

    const first = await store.increment('203.0.113.5')
    expect(first.totalHits).toBe(1)
    expect(first.resetTime).toBeInstanceOf(Date)
    expect(first.resetTime!.getTime()).toBeGreaterThan(Date.now())

    expect((await store.increment('203.0.113.5')).totalHits).toBe(2)
    expect((await store.increment('203.0.113.5')).totalHits).toBe(3)
  })

  it('resets the window after windowMs elapses', async () => {
    const store = new DistributedRateLimitStore('vidsmm:rl:t2:', () => Promise.resolve(redis))
    initStore(store, 60)

    expect((await store.increment('203.0.113.6')).totalHits).toBe(1)
    await new Promise((r) => setTimeout(r, 120))
    expect((await store.increment('203.0.113.6')).totalHits).toBe(1)
  })

  it('get() returns current hits and undefined after resetKey', async () => {
    const store = new DistributedRateLimitStore('vidsmm:rl:t3:', () => Promise.resolve(redis))
    initStore(store)

    await store.increment('203.0.113.7')
    const info = await store.get('203.0.113.7')
    expect(info?.totalHits).toBe(1)

    await store.resetKey('203.0.113.7')
    expect(await store.get('203.0.113.7')).toBeUndefined()
  })

  it('decrement() lowers the count and deletes the key at zero', async () => {
    const store = new DistributedRateLimitStore('vidsmm:rl:t4:', () => Promise.resolve(redis))
    initStore(store)

    await store.increment('203.0.113.8')
    await store.increment('203.0.113.8')
    await store.decrement('203.0.113.8')
    expect((await store.get('203.0.113.8'))?.totalHits).toBe(1)
    await store.decrement('203.0.113.8')
    expect(await store.get('203.0.113.8')).toBeUndefined()
  })

  it('resetAll() clears only its own prefix', async () => {
    const storeA = new DistributedRateLimitStore('vidsmm:rl:a:', () => Promise.resolve(redis))
    const storeB = new DistributedRateLimitStore('vidsmm:rl:b:', () => Promise.resolve(redis))
    initStore(storeA)
    initStore(storeB)

    await storeA.increment('ip-x')
    await storeB.increment('ip-x')
    await storeA.resetAll()

    expect(await storeA.get('ip-x')).toBeUndefined()
    expect((await storeB.get('ip-x'))?.totalHits).toBe(1)
  })
})

/** Simulates an orphaned key: INCR/DECR work but PTTL always reports no
 *  expiry (-1) — the state a key is left in when the first-hit PEXPIRE
 *  failed mid-flight. Records pExpire calls so the self-heal is visible. */
class NoTtlRedis implements RateLimitRedisClient {
  private data = new Map<string, number>()
  readonly pExpireCalls: string[] = []

  async get(key: string): Promise<string | null> {
    const v = this.data.get(key)
    return v === undefined ? null : String(v)
  }

  async incr(key: string): Promise<number> {
    const v = (this.data.get(key) ?? 0) + 1
    this.data.set(key, v)
    return v
  }

  async pExpire(key: string): Promise<number> {
    this.pExpireCalls.push(key)
    return 1
  }

  async pTTL(): Promise<number> {
    return -1
  }

  async decr(key: string): Promise<number> {
    const v = (this.data.get(key) ?? 0) - 1
    this.data.set(key, v)
    return v
  }

  async del(key: string): Promise<number> {
    return this.data.delete(key) ? 1 : 0
  }

  async *scanIterator(options: { MATCH: string; COUNT: number }): AsyncIterable<string[]> {
    yield [...this.data.keys()].filter((k) => k.startsWith(options.MATCH.replace('*', '')))
  }
}

describe('DistributedRateLimitStore — fallback to memory', () => {
  it('degrades to in-memory when Redis is disabled (client null)', async () => {
    const store = new DistributedRateLimitStore('vidsmm:rl:mem:', () => Promise.resolve(null))
    initStore(store)

    expect((await store.increment('203.0.113.9')).totalHits).toBe(1)
    expect((await store.increment('203.0.113.9')).totalHits).toBe(2)
    expect((await store.increment('203.0.113.9')).totalHits).toBe(3)
    expect((await store.get('203.0.113.9'))?.totalHits).toBe(3)

    await store.resetKey('203.0.113.9')
    expect((await store.increment('203.0.113.9')).totalHits).toBe(1)
  })

  it('falls back per-request when Redis errors mid-flight', async () => {
    const store = new DistributedRateLimitStore('vidsmm:rl:err:', () =>
      Promise.resolve(new ThrowingRedis()),
    )
    initStore(store)

    // First hit throws on Redis → served from memory.
    expect((await store.increment('203.0.113.10')).totalHits).toBe(1)
    expect((await store.increment('203.0.113.10')).totalHits).toBe(2)
  })

  it('marks itself as distributed (localKeys false) with the given prefix', () => {
    const store = new DistributedRateLimitStore('vidsmm:rl:meta:', () => Promise.resolve(null))
    expect(store.localKeys).toBe(false)
    expect(store.prefix).toBe('vidsmm:rl:meta:')
  })

  it('self-heals an orphaned key that lost its TTL (re-stamps the window)', async () => {
    const redis = new NoTtlRedis()
    const store = new DistributedRateLimitStore('vidsmm:rl:orphan:', () => Promise.resolve(redis))
    initStore(store, 60_000)

    // First hit stamps the window; subsequent hits with PTTL -1 re-stamp it.
    await store.increment('203.0.113.99')
    await store.increment('203.0.113.99')
    expect(redis.pExpireCalls).toContain('vidsmm:rl:orphan:203.0.113.99')
    expect(redis.pExpireCalls.length).toBeGreaterThanOrEqual(2)
  })
})

// ---------------------------------------------------------------------------
// Real-Redis integration — run with `RUN_REDIS_TESTS=1` and a Redis on
// localhost:6379 (e.g. docker run -d -p 6379:6379 redis:7-alpine).
// Skipped otherwise so the hermetic suite stays fast and dependency-free.
// ---------------------------------------------------------------------------
const runRedisTests = process.env.RUN_REDIS_TESTS === '1'

describe.skipIf(!runRedisTests)('DistributedRateLimitStore — real Redis (fairness across stores)', () => {
  let client: RedisClientType
  const getClient = (): Promise<RateLimitRedisClient | null> => Promise.resolve(client)

  beforeAll(async () => {
    const c = createClient({
      url: 'redis://localhost:6379',
      socket: { connectTimeout: 2000, reconnectStrategy: () => false },
    })
    await c.connect()
    client = c
  })

  afterAll(async () => {
    await client?.quit().catch(() => undefined)
  })

  it('two store instances SHARE the same global counter (distributed fairness)', async () => {
    // Two stores = two limiter instances on two backend processes, both
    // pointing at the same Redis — the exact multi-instance production shape.
    const instanceA = new DistributedRateLimitStore('vidsmm:rl:fair:', getClient)
    const instanceB = new DistributedRateLimitStore('vidsmm:rl:fair:', getClient)
    initStore(instanceA, 60_000)
    initStore(instanceB, 60_000)
    await instanceA.resetKey('shared-ip')

    expect((await instanceA.increment('shared-ip')).totalHits).toBe(1)
    // Instance B sees the hit that instance A recorded — a user split across
    // instances by the load balancer gets ONE global quota.
    expect((await instanceB.increment('shared-ip')).totalHits).toBe(2)
    expect((await instanceA.increment('shared-ip')).totalHits).toBe(3)

    await instanceA.resetKey('shared-ip')
  })

  it('different limiter prefixes never collide on shared Redis', async () => {
    const api = new DistributedRateLimitStore('vidsmm:rl:api:', getClient)
    const login = new DistributedRateLimitStore('vidsmm:rl:login:', getClient)
    initStore(api, 60_000)
    initStore(login, 60_000)
    await api.resetKey('nobody')
    await login.resetKey('nobody')

    expect((await api.increment('nobody')).totalHits).toBe(1)
    expect((await login.increment('nobody')).totalHits).toBe(1)

    await api.resetKey('nobody')
    await login.resetKey('nobody')
  })

  it('get(), decrement() and resetAll() work against real Redis', async () => {
    const storeA = new DistributedRateLimitStore('vidsmm:rl:ops:', getClient)
    const storeB = new DistributedRateLimitStore('vidsmm:rl:ops2:', getClient)
    initStore(storeA, 60_000)
    initStore(storeB, 60_000)
    await storeA.resetKey('ops-ip')
    await storeB.resetKey('ops-ip')

    await storeA.increment('ops-ip')
    await storeA.increment('ops-ip')
    expect((await storeA.get('ops-ip'))?.totalHits).toBe(2)

    await storeA.decrement('ops-ip')
    expect((await storeA.get('ops-ip'))?.totalHits).toBe(1)

    // resetAll on A clears A's prefix only — B's counter survives.
    await storeB.increment('ops-ip')
    await storeA.resetAll()
    expect(await storeA.get('ops-ip')).toBeUndefined()
    expect((await storeB.get('ops-ip'))?.totalHits).toBe(1)

    await storeA.resetKey('ops-ip')
    await storeB.resetKey('ops-ip')
  })

  it('window expiry works against real Redis', async () => {
    const store = new DistributedRateLimitStore('vidsmm:rl:exp:', getClient)
    initStore(store, 300)
    await store.resetKey('exp-ip')

    expect((await store.increment('exp-ip')).totalHits).toBe(1)
    await new Promise((r) => setTimeout(r, 600))
    expect((await store.increment('exp-ip')).totalHits).toBe(1)

    await store.resetKey('exp-ip')
  })
})
