import { MemoryStore } from 'express-rate-limit'
import type { ClientRateLimitInfo, IncrementResponse, Options, Store } from 'express-rate-limit'
import { getRedisClient } from '../services/redis/redis.client.js'
import { logger } from '../utils/logger.js'

/**
 * Distributed rate-limit store backed by Redis, so the global API limit is
 * enforced ACROSS every backend instance — not per-process.
 *
 * When multiple instances share one Redis (see docker-compose scale + the
 * cross-instance SSE bus), an IP hitting instance A and instance B counts
 * against the SAME window: `RATE_LIMIT_MAX` is truly global, which keeps the
 * limiter fair behind a load balancer.
 *
 * Algorithm (fixed window, atomic):
 *
 *   1. `INCR key`            → total hits this window
 *   2. `PEXPIRE key window`  → set the TTL only on the FIRST hit (subsequent
 *      hits leave the existing expiry untouched — exactly the fixed-window
 *      semantics express-rate-limit's headers advertise via resetTime)
 *   3. `PTTL key`            → resetTime for the `RateLimit-Reset` header
 *
 * Degradation / recovery (mirrors the SSE bus):
 *
 *   - `REDIS_URL` unset or unreachable ⇒ every operation delegates to an
 *     in-memory MemoryStore (the pre-Redis behaviour). Requests never fail
 *     because of Redis.
 *   - A per-request try/catch around the Redis round-trips also falls back
 *     to memory for that single request if the connection blips mid-flight.
 *   - When Redis comes back (the shared client reconnects with a 30s probe
 *     backoff), the store switches back to Redis automatically — counts then
 *     re-sync globally on the next window.
 */

/** The subset of the node-redis client the store actually uses — kept tiny so
 *  tests can inject a fake client and the real client type still fits. */
export interface RateLimitRedisClient {
  get(key: string): Promise<string | null>
  incr(key: string): Promise<number>
  /** PEXPIRE reply is a number in node-redis v6; we never read it. */
  pExpire(key: string, milliseconds: number): Promise<unknown>
  pTTL(key: string): Promise<number>
  decr(key: string): Promise<number>
  del(key: string): Promise<number>
  /** node-redis v6 yields SCAN pages (batches of keys), not single keys. */
  scanIterator(options: { MATCH: string; COUNT: number }): AsyncIterable<string[]>
}

type GetClient = () => Promise<RateLimitRedisClient | null>

export class DistributedRateLimitStore implements Store {
  /** Counts live in a shared Redis — other instances CAN see them. */
  readonly localKeys = false
  /** Full Redis key prefix (also tells express-rate-limit this store
   *  namespaces keys, so the double-count validation stays quiet). */
  readonly prefix: string

  private windowMs = 60_000
  /** In-memory fallback used whenever Redis is unavailable. Per store
   *  instance, so limiters never share state even in degraded mode. */
  private readonly fallback = new MemoryStore()
  private readonly getClient: GetClient

  constructor(prefix: string, getClient: GetClient = getRedisClient) {
    this.prefix = prefix
    this.getClient = getClient
  }

  init(options: Options): void {
    this.windowMs = options.windowMs
    this.fallback.init(options)
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    const client = await this.getClient()
    if (!client) return this.fallback.get(key)
    try {
      const redisKey = this.redisKey(key)
      const [count, ttl] = await Promise.all([client.get(redisKey), client.pTTL(redisKey)])
      if (count === null) return undefined
      return { totalHits: Number(count), resetTime: this.resetTimeFromTtl(ttl) }
    } catch (err) {
      this.warn(err)
      return this.fallback.get(key)
    }
  }

  async increment(key: string): Promise<IncrementResponse> {
    const client = await this.getClient()
    if (!client) return this.fallback.increment(key)

    try {
      const redisKey = this.redisKey(key)
      // Atomic count, then stamp the window only on the first hit.
      const totalHits = await client.incr(redisKey)
      if (totalHits === 1) {
        await client.pExpire(redisKey, this.windowMs)
      }
      const ttl = await client.pTTL(redisKey)
      // Self-heal an orphaned key: if the first-hit PEXPIRE ever failed
      // mid-flight the key has no TTL (-1) and would block this client
      // forever — re-stamp the window so it expires like a normal key.
      if (ttl === -1 && totalHits > 1) {
        await client.pExpire(redisKey, this.windowMs)
      }
      return { totalHits, resetTime: this.resetTimeFromTtl(ttl) }
    } catch (err) {
      this.warn(err)
      return this.fallback.increment(key)
    }
  }

  async decrement(key: string): Promise<void> {
    const client = await this.getClient()
    if (!client) return this.fallback.decrement(key)
    try {
      const redisKey = this.redisKey(key)
      const count = await client.decr(redisKey)
      // Never leave a negative/zero counter or a dead key behind.
      if (count <= 0) await client.del(redisKey)
    } catch (err) {
      this.warn(err)
      await this.fallback.decrement(key)
    }
  }

  async resetKey(key: string): Promise<void> {
    const client = await this.getClient()
    if (!client) return this.fallback.resetKey(key)
    try {
      await client.del(this.redisKey(key))
    } catch (err) {
      this.warn(err)
      await this.fallback.resetKey(key)
    }
  }

  async resetAll(): Promise<void> {
    const client = await this.getClient()
    if (!client) return this.fallback.resetAll()
    try {
      const pattern = `${this.prefix}*`
      for await (const keys of client.scanIterator({ MATCH: pattern, COUNT: 100 })) {
        for (const key of keys) {
          await client.del(key)
        }
      }
    } catch (err) {
      this.warn(err)
      await this.fallback.resetAll()
    }
  }

  async shutdown(): Promise<void> {
    // The shared Redis client is owned by services/redis/redis.client.ts
    // (closed via shutdownRedisClient()); here we only release the fallback's
    // interval timer.
    await this.fallback.shutdown()
  }

  private redisKey(key: string): string {
    return `${this.prefix}${key}`
  }

  /** TTL from PTTL → absolute reset time (or undefined for a missing key /
   *  key without expiry). */
  private resetTimeFromTtl(ttl: number): Date | undefined {
    if (ttl > 0) return new Date(Date.now() + ttl)
    return undefined
  }

  private lastWarnAt = 0

  /** Throttled to one warning per 30s window — a Redis outage otherwise
   *  spams a log line per request (the shared client already warns once per
   *  connect attempt). */
  private warn(err: unknown): void {
    const now = Date.now()
    if (now - this.lastWarnAt < 30_000) return
    this.lastWarnAt = now
    logger.warn(
      `[rate-limit] Redis error (${err instanceof Error ? err.message : String(err)}) — using in-memory for this request`,
    )
  }
}

/** One store PER limiter (express-rate-limit forbids sharing a store), each
 *  with its own Redis key namespace so quotas never bleed across limiters. */
export function createDistributedStore(prefix: string): DistributedRateLimitStore {
  return new DistributedRateLimitStore(prefix)
}
