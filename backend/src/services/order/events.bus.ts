import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { createClient, type RedisClientType } from 'redis'
import { env } from '../../config/env.js'
import { logger } from '../../utils/logger.js'

/**
 * Order status pub/sub bus — powers real-time order status updates on the
 * Orders list and Order detail pages.
 *
 * Same two-layer design as the payment events bus (`services/payment/events.bus.ts`):
 *
 *  1. Local: an in-memory EventEmitter dispatches within this process.
 *  2. Cross-instance: when `REDIS_URL` is configured, events are ALSO
 *     published to a shared Redis channel. Every backend instance relays
 *     them to its own local listeners, so the order-sync job landing on
 *     instance A pushes SSE streams on instances B and C too.
 *
 * Events are keyed by USER id — an SSE stream for one customer never
 * receives another customer's order updates.
 *
 * Degradation: `REDIS_URL` unset or unreachable ⇒ seamless in-memory
 * fallback (single instance / local dev). The client-side 5s polling plus
 * the SSE reconnect remain the eventual-consistency safety net if the
 * Redis link drops mid-flight.
 */

export interface OrderStatusPayload {
  /** Owner of the order — the SSE stream is scoped to this user. */
  userId: string
  orderId: string
  orderNumber?: number | null
  /** Only present when the status actually changed. */
  status?: string
  remains?: number
  startCount?: number
  charge?: number
  providerOrderId?: number | null
  updatedAt?: string
  /** @internal — publishing process id, used to ignore our own Redis echo. */
  instanceId?: string
}

/** Redis channel name — namespace it so it never collides with other apps. */
const CHANNEL = 'digitalsmm:order-status'

const instanceId = randomUUID()

const emitter = new EventEmitter()
emitter.setMaxListeners(0)

function channel(userId: string): string {
  return `orders:${userId}`
}

/** Local delivery. Strips the internal instanceId from what listeners see. */
function emitLocal(payload: OrderStatusPayload): void {
  const { instanceId: _internal, ...publicPayload } = payload
  emitter.emit(channel(payload.userId), publicPayload)
}

// ---------------------------------------------------------------------------
// Redis (cross-instance)
// ---------------------------------------------------------------------------

let publisher: RedisClientType | null = null
let subscriber: RedisClientType | null = null
let redisReady = false
/** Backoff gate so a down Redis is probed at most every 30s, not per event. */
let nextRetryAt = 0

function redisEnabled(): boolean {
  return (env.REDIS_URL ?? '').length > 0
}

const REDIS_CONNECT_TIMEOUT_MS = 500

async function ensureRedis(): Promise<void> {
  if (!redisEnabled() || redisReady) return
  const now = Date.now()
  if (now < nextRetryAt) return
  nextRetryAt = now + 30_000

  const url = env.REDIS_URL ?? ''
  let pub: RedisClientType | null = null
  let sub: RedisClientType | null = null
  try {
    pub = createClient({ url })
    sub = createClient({ url })
    let pubErrorLogged = false
    let subErrorLogged = false
    pub.on('error', (err) => {
      if (pubErrorLogged) return
      pubErrorLogged = true
      logger.warn('[order-events] Redis publisher error', err)
    })
    sub.on('error', (err) => {
      if (subErrorLogged) return
      subErrorLogged = true
      logger.warn('[order-events] Redis subscriber error', err)
    })

    const pubConn = pub.connect()
    const subConn = sub.connect()
    pubConn.catch(() => undefined)
    subConn.catch(() => undefined)

    const connect = (conn: Promise<unknown>): Promise<void> =>
      new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`Redis connect timed out after ${REDIS_CONNECT_TIMEOUT_MS}ms`)),
          REDIS_CONNECT_TIMEOUT_MS,
        )
        conn.then(
          () => {
            clearTimeout(timer)
            resolve()
          },
          (err) => {
            clearTimeout(timer)
            reject(err)
          },
        )
      })

    await connect(pubConn)
    await connect(subConn)

    // Relay cross-instance messages to local listeners, skipping our own echo.
    await sub.subscribe(CHANNEL, (raw) => {
      try {
        const payload = JSON.parse(raw) as OrderStatusPayload
        if (payload.instanceId === instanceId) return // our own echo
        emitLocal(payload)
      } catch {
        /* malformed message from a foreign client — ignore */
      }
    })

    publisher = pub
    subscriber = sub
    redisReady = true
    logger.info('[order-events] Redis pub/sub connected — cross-instance order events enabled')
  } catch (err) {
    pub?.destroy()
    sub?.destroy()
    publisher = null
    subscriber = null
    redisReady = false
    logger.warn(
      `[order-events] Redis unavailable (${err instanceof Error ? err.message : String(err)}) — running in-memory only`,
    )
  }
}

/** Closes the Redis clients (server shutdown / tests). Idempotent. */
export async function shutdownOrderRedis(): Promise<void> {
  const clients = [publisher, subscriber].filter(Boolean) as RedisClientType[]
  publisher = null
  subscriber = null
  redisReady = false
  await Promise.all(clients.map((c) => c.quit().catch(() => undefined)))
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Publishes a status update for a user's order (local + cross-instance). */
export function emitOrderStatus(payload: OrderStatusPayload): void {
  const full = { ...payload, instanceId }
  emitLocal(full)
  if (redisReady && publisher) {
    void publisher.publish(CHANNEL, JSON.stringify(full)).catch((err) =>
      logger.warn('[order-events] Redis publish failed', err),
    )
  } else {
    void ensureRedis()
  }
}

/**
 * Subscribes to status updates for a user's orders. Returns an unsubscribe fn.
 * Also kicks off the lazy Redis connection so this instance can receive
 * cross-instance events for as long as it has listeners.
 */
export function subscribeOrderStatus(
  userId: string,
  listener: (payload: OrderStatusPayload) => void,
): () => void {
  const ch = channel(userId)
  emitter.on(ch, listener)
  void ensureRedis()
  return () => emitter.off(ch, listener)
}
