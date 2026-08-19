import { createClient, type RedisClientType } from 'redis'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'

/**
 * Redis-backed cache service — powers analytics, catalog and admin dashboard
 * caching. Follows the same resilience contract as the existing Redis clients
 * (rate limiter, payment bus, order bus):
 *
 *  - `REDIS_URL` unset       → never connects, all operations become no-ops
 *  - `REDIS_URL` unreachable  → bounded connect timeout, 30s backoff gate,
 *    callers degrade gracefully (uncached DB query)
 *  - `REDIS_URL` reachable    → connected client cached for process lifetime
 *
 * SECURITY: Only safe, non-sensitive data is cached (analytics aggregates,
 * service lists, category lists). NEVER cache: secrets, JWTs, user passwords,
 * API keys, decrypted credentials, payment QR strings, or PII.
 */

// ---------------------------------------------------------------------------
// Connection management (mirrors the existing redis.client.ts pattern)
// ---------------------------------------------------------------------------

const REDIS_CONNECT_TIMEOUT_MS = 500
const RETRY_BACKOFF_MS = 30_000

let client: RedisClientType | null = null
let connectPromise: Promise<RedisClientType | null> | null = null
let nextRetryAt = 0
let shuttingDown = false

function redisEnabled(): boolean {
  return (env.REDIS_URL ?? '').length > 0
}

async function getClient(): Promise<RedisClientType | null> {
  if (client) return client
  if (shuttingDown || !redisEnabled()) return null
  if (Date.now() < nextRetryAt) return null
  if (connectPromise) return connectPromise

  nextRetryAt = Date.now() + RETRY_BACKOFF_MS
  connectPromise = connect()
  try {
    return await connectPromise
  } finally {
    connectPromise = null
  }
}

async function connect(): Promise<RedisClientType | null> {
  const url = env.REDIS_URL ?? ''
  let c: RedisClientType | null = null
  try {
    c = createClient({ url })
    let errorLogged = false
    c.on('error', (err) => {
      if (errorLogged) return
      errorLogged = true
      logger.warn('[cache] Redis connection error', err)
    })

    const conn = c.connect()
    conn.catch(() => undefined)

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Redis connect timed out after ${REDIS_CONNECT_TIMEOUT_MS}ms`)),
        REDIS_CONNECT_TIMEOUT_MS,
      )
      conn.then(
        () => {
          clearTimeout(timer)
          resolve()
        },
        (err: unknown) => {
          clearTimeout(timer)
          reject(err)
        },
      )
    })

    if (shuttingDown) {
      c.destroy()
      return null
    }

    client = c
    logger.info('[cache] Redis connected — caching enabled')
    return c
  } catch (err) {
    c?.destroy()
    client = null
    logger.warn(
      `[cache] Redis unavailable (${err instanceof Error ? err.message : String(err)}) — all reads fall back to MongoDB`,
    )
    return null
  }
}

/** Closes the cache client (server shutdown / tests). Idempotent. */
export async function shutdownCache(): Promise<void> {
  shuttingDown = true
  const c = client
  client = null
  connectPromise = null
  nextRetryAt = 0
  if (c) {
    await c.quit().catch(() => undefined)
  }
}

// ---------------------------------------------------------------------------
// Cache statistics (for health endpoint / daily report)
// ---------------------------------------------------------------------------

export interface CacheStats {
  enabled: boolean
  connected: boolean
  hits: number
  misses: number
  sets: number
  deletes: number
  hitRate: number
}

let hits = 0
let misses = 0
let sets = 0
let deletes = 0

export function cacheStats(): CacheStats {
  const total = hits + misses
  return {
    enabled: redisEnabled(),
    connected: client !== null,
    hits,
    misses,
    sets,
    deletes,
    hitRate: total > 0 ? Math.round((hits / total) * 10000) / 100 : 0,
  }
}

/** Reset stats (e.g. for tests). */
export function resetCacheStats(): void {
  hits = 0
  misses = 0
  sets = 0
  deletes = 0
}

// ---------------------------------------------------------------------------
// Cache operations — all graceful-degrade: Redis down → skip silently
// ---------------------------------------------------------------------------

const KEY_PREFIX = 'digitalsmm:cache:'

/**
 * Get a cached value by key. Returns `null` on miss or when Redis is
 * unavailable (callers fall back to DB).
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const c = await getClient()
  if (!c) {
    misses += 1
    return null
  }
  try {
    const raw = await c.get(`${KEY_PREFIX}${key}`)
    if (raw === null) {
      misses += 1
      return null
    }
    hits += 1
    return JSON.parse(raw) as T
  } catch {
    misses += 1
    return null
  }
}

/**
 * Store a value in cache with a TTL.
 * @param key    Cache key (will be prefixed automatically).
 * @param value  JSON-serializable value.
 * @param ttlMs  Time-to-live in milliseconds.
 */
export async function cacheSet(key: string, value: unknown, ttlMs: number): Promise<void> {
  const c = await getClient()
  if (!c) return
  try {
    await c.set(`${KEY_PREFIX}${key}`, JSON.stringify(value), { PX: ttlMs })
    sets += 1
  } catch {
    // Cache write failure is non-fatal — next request will repopulate.
  }
}

/**
 * Invalidate (delete) a single cache key.
 */
export async function cacheDel(key: string): Promise<void> {
  const c = await getClient()
  if (!c) return
  try {
    await c.del(`${KEY_PREFIX}${key}`)
    deletes += 1
  } catch {
    // Non-fatal.
  }
}

/**
 * Invalidate all keys matching a glob pattern.
 * Use sparingly — SCAN is O(N) against the keyspace.
 */
export async function cacheInvalidatePattern(pattern: string): Promise<void> {
  const c = await getClient()
  if (!c) return
  try {
    const fullPattern = `${KEY_PREFIX}${pattern}`
    let count = 0
    for await (const keys of c.scanIterator({ MATCH: fullPattern, COUNT: 100 })) {
      for (const key of keys) {
        await c.del(key)
        count += 1
      }
    }
    if (count > 0) {
      deletes += count
      logger.info(`[cache] invalidated ${count} keys matching "${pattern}"`)
    }
  } catch {
    // Non-fatal — stale cache will expire naturally via TTL.
  }
}

// ---------------------------------------------------------------------------
// Higher-level cache helpers (with TTL presets and key builders)
// ---------------------------------------------------------------------------

/** Cache TTL presets. */
export const CACHE_TTL = {
  /** Analytics aggregations — 2 minutes (admin dashboard refreshes often). */
  ANALYTICS: 2 * 60 * 1000,
  /** Active service/category catalog — 5 minutes (read-heavy, changes rarely). */
  CATALOG: 5 * 60 * 1000,
  /** System health / dependency status — 30 seconds. */
  HEALTH: 30 * 1000,
  /** Latest deployments — 1 minute. */
  DEPLOYMENTS: 60 * 1000,
} as const

/** Cache key builders (namespaced, predictable). */
export const cacheKeys = {
  analyticsRevenue: (range: string, start: string, end: string) =>
    `analytics:revenue:${range}:${start}:${end}`,
  analyticsOverview: (range: string, start: string, end: string) =>
    `analytics:overview:${range}:${start}:${end}`,
  analyticsServices: (range: string, start: string, end: string) =>
    `analytics:services:${range}:${start}:${end}`,
  catalogCategories: (curated: boolean) =>
    `catalog:categories:${curated ? 'curated' : 'all'}`,
  catalogServices: (params: string) =>
    `catalog:services:${params}`,
  healthDeps: () =>
    `health:deps`,
  deploymentsLatest: () =>
    `deployments:latest`,
} as const

/**
 * Smart cache-get-or-compute. Returns cached value if available, otherwise
 * runs `fn`, caches the result, and returns it. If `fn` throws, the error
 * propagates (cache miss is NOT an error — only cache write failure is
 * silently swallowed).
 */
export async function cacheOrCompute<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const cached = await cacheGet<T>(key)
  if (cached !== null) return cached

  const result = await fn()
  // Only cache non-null results (don't cache "not found" as a value).
  if (result !== null && result !== undefined) {
    await cacheSet(key, result, ttlMs)
  }
  return result
}

// ---------------------------------------------------------------------------
// Invalidation helpers for business events
// ---------------------------------------------------------------------------

/** Call after services/categories are created/updated/deleted. */
export async function invalidateCatalogCache(): Promise<void> {
  await cacheInvalidatePattern('catalog:*')
}

/** Call after orders/payments change (refreshes admin analytics). */
export async function invalidateAnalyticsCache(): Promise<void> {
  await cacheInvalidatePattern('analytics:*')
}

/** Call after deployments are recorded. */
export async function invalidateDeploymentCache(): Promise<void> {
  await cacheDel(cacheKeys.deploymentsLatest())
}
