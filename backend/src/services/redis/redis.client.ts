import { createClient, type RedisClientType } from 'redis'
import { env } from '../../config/env.js'
import { logger } from '../../utils/logger.js'

/**
 * Shared lazy Redis command client — powers the distributed rate limiter
 * (see middleware/rate-limit.store.ts).
 *
 * Mirrors the resilience contract of the payment SSE bus (events.bus.ts):
 *
 *  - `REDIS_URL` unset            → never connects, always returns null.
 *  - `REDIS_URL` unreachable      → connect attempt is cut short by a bounded
 *    timeout, clients destroyed (no reconnect loops), and a 30s backoff gate
 *    probes again later. Callers degrade gracefully in the meantime.
 *  - `REDIS_URL` reachable        → returns the connected client, cached for
 *    the process lifetime; node-redis handles reconnects from here on.
 *
 * A single client is shared by every limiter store (they only issue
 * commands), so the whole app opens exactly one extra Redis connection.
 */

/** How long a connect attempt may take before we give up and retry later.
 *  Short on purpose: when Redis is down (e.g. local dev without a Redis
 *  server), the FIRST request in each backoff window waits for this timeout
 *  before falling back to in-memory. 3s made payment status polls stall for
 *  3+ seconds once per 30s window; 500ms is plenty for a local connection
 *  (sub-ms on the same host) and keeps a down-Redis hiccup imperceptible. */
const REDIS_CONNECT_TIMEOUT_MS = 500
/** Backoff between failed connect attempts — probes a down Redis at most
 *  once every 30s, never on the per-request hot path. */
const RETRY_BACKOFF_MS = 30_000

let client: RedisClientType | null = null
let connectPromise: Promise<RedisClientType | null> | null = null
let nextRetryAt = 0
let shuttingDown = false

function redisEnabled(): boolean {
  return (env.REDIS_URL ?? '').length > 0
}

/**
 * Returns the connected Redis client, or null when Redis is disabled or
 * currently unavailable (graceful degradation — callers fall back to
 * in-memory). Single-flight: concurrent callers share one connect attempt.
 */
export async function getRedisClient(): Promise<RedisClientType | null> {
  if (client) return client
  if (shuttingDown || !redisEnabled()) return null
  // Backoff gate — don't hammer a down Redis on every request.
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
    // Log at most once per connect attempt. node-redis fires an 'error'
    // event on EVERY background reconnect retry while the host is down,
    // which would otherwise spam the log (hundreds of lines per minute)
    // and drown out real payment/order logs.
    let errorLogged = false
    c.on('error', (err) => {
      if (errorLogged) return
      errorLogged = true
      logger.warn('[redis.client] connection error', err)
    })

    const conn = c.connect()
    // Swallow late rejections (e.g. destroy() while a connect is pending) so
    // they never surface as unhandled promise rejections.
    conn.catch(() => undefined)

    // Bounded connect — node-redis keeps retrying a down host in the
    // background, so race against a timeout and drop the half-built client.
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

    // A shutdown may have raced this connect — never cache a client the
    // process is about to leave behind.
    if (shuttingDown) {
      c.destroy()
      return null
    }

    client = c
    logger.info('[redis.client] connected — distributed rate limiting enabled')
    return c
  } catch (err) {
    // Stop any background reconnect loop and drop the half-built client.
    c?.destroy()
    client = null
    logger.warn(
      `[redis.client] unavailable (${err instanceof Error ? err.message : String(err)}) — rate limiting falls back to in-memory`,
    )
    return null
  }
}

/** Closes the shared client (server shutdown / tests). Idempotent. */
export async function shutdownRedisClient(): Promise<void> {
  shuttingDown = true
  const c = client
  client = null
  connectPromise = null
  nextRetryAt = 0
  if (c) {
    await c.quit().catch(() => undefined)
  }
}
