import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { createClient, type RedisClientType } from 'redis'
import { env } from '../../config/env.js'
import { logger } from '../../utils/logger.js'

/**
 * Payment status pub/sub bus — powers the real-time KHQR status page.
 *
 * Two layers, one API (`emitPaymentStatus` / `subscribePaymentStatus`):
 *
 *  1. Local: an in-memory EventEmitter dispatches within this process.
 *  2. Cross-instance: when `REDIS_URL` is configured, events are ALSO
 *     published to a shared Redis channel. Every backend instance relays
 *     them to its own local listeners, so a webhook landing on instance A
 *     flips the SSE stream on instances B and C too.
 *
 * A per-process `instanceId` lets each instance ignore its own Redis echo
 * (the publisher and subscriber use separate connections, so Redis would
 * otherwise deliver a message back to the process that published it —
 * double delivery). Local listeners receive payloads WITHOUT the internal
 * instanceId, keeping the public contract identical to before.
 *
 * Degradation: `REDIS_URL` unset or unreachable ⇒ seamless in-memory
 * fallback (the pre-Redis behavior), so local development never requires
 * Redis. The client-side 3s polling + SSE re-snapshot remain the
 * eventual-consistency safety net if the Redis link drops mid-flight.
 */

export interface PaymentStatusPayload {
  referenceId: string
  status: string
  orderId?: string | null
  orderStatus?: string | null
  approvedAt?: string | null
  /** @internal — publishing process id, used to ignore our own Redis echo. */
  instanceId?: string
}

/** Redis channel name — namespace it so it never collides with other apps. */
const CHANNEL = 'vidsmm:payment-status'

const instanceId = randomUUID()

const emitter = new EventEmitter()
emitter.setMaxListeners(0)

function channel(referenceId: string): string {
  return `payment:${referenceId}`
}

/** Local delivery. Strips the internal instanceId from what listeners see. */
function emitLocal(payload: PaymentStatusPayload): void {
  const { instanceId: _internal, ...publicPayload } = payload
  emitter.emit(channel(payload.referenceId), publicPayload)
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

/** How long a Redis connect may take before we give up and retry later.
 *  500ms (was 3s): when Redis is down locally, each backoff-window probe
 *  would otherwise hold the connect for 3s and — because the subscriber
 *  connects from the SSE/status hot path — stall payment page requests.
 *  Local Redis connects in <1ms; if it is not up in 500ms it is down. */
const REDIS_CONNECT_TIMEOUT_MS = 500

/**
 * Connects the shared Redis clients once per process. Safe to call many
 * times; failures are logged and retried later (30s backoff) — the bus
 * keeps working in-memory in the meantime.
 *
 * Every path settles: a connect that hangs (node-redis retries a down
 * host in the background) is cut short by the timeout, and the clients
 * are destroyed so no reconnect loop or dangling timer leaks.
 */
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
    // Log at most once per connect attempt — node-redis retries a down host
    // in the background and would otherwise emit hundreds of error lines.
    let pubErrorLogged = false
    let subErrorLogged = false
    pub.on('error', (err) => {
      if (pubErrorLogged) return
      pubErrorLogged = true
      logger.warn('[events.bus] Redis publisher error', err)
    })
    sub.on('error', (err) => {
      if (subErrorLogged) return
      subErrorLogged = true
      logger.warn('[events.bus] Redis subscriber error', err)
    })

    const pubConn = pub.connect()
    const subConn = sub.connect()
    // Swallow late rejections (e.g. destroy() while a connect is pending) so
    // they never surface as unhandled promise rejections.
    pubConn.catch(() => undefined)
    subConn.catch(() => undefined)

    const connect = (conn: Promise<unknown>): Promise<void> =>
      new Promise<void>((resolve, reject) => {
        // Cancellable timeout — cleared the moment the connect settles so no
        // dangling timer lingers after a successful connection.
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
        const payload = JSON.parse(raw) as PaymentStatusPayload
        if (payload.instanceId === instanceId) return // our own echo
        emitLocal(payload)
      } catch {
        /* malformed message from a foreign client — ignore */
      }
    })

    publisher = pub
    subscriber = sub
    redisReady = true
    logger.info('[events.bus] Redis pub/sub connected — cross-instance payment events enabled')
  } catch (err) {
    // Stop any background reconnect loops and drop the half-built clients.
    pub?.destroy()
    sub?.destroy()
    publisher = null
    subscriber = null
    redisReady = false
    logger.warn(
      `[events.bus] Redis unavailable (${err instanceof Error ? err.message : String(err)}) — running in-memory only`,
    )
  }
}

/** Closes the Redis clients (server shutdown / tests). Idempotent. */
export async function shutdownRedis(): Promise<void> {
  const clients = [publisher, subscriber].filter(Boolean) as RedisClientType[]
  publisher = null
  subscriber = null
  redisReady = false
  await Promise.all(clients.map((c) => c.quit().catch(() => undefined)))
}

// ---------------------------------------------------------------------------
// Public API (unchanged)
// ---------------------------------------------------------------------------

/** Publishes a status change for a payment reference (local + cross-instance). */
export function emitPaymentStatus(payload: PaymentStatusPayload): void {
  const full = { ...payload, instanceId }
  emitLocal(full)
  if (redisReady && publisher) {
    void publisher.publish(CHANNEL, JSON.stringify(full)).catch((err) =>
      logger.warn('[events.bus] Redis publish failed', err),
    )
  } else {
    // Not ready yet — nudge the connect attempt (guarded internally).
    void ensureRedis()
  }
}

/**
 * Subscribes to status changes for a reference. Returns an unsubscribe fn.
 * Also kicks off the lazy Redis connection so this instance can receive
 * cross-instance events for as long as it has listeners.
 */
export function subscribePaymentStatus(
  referenceId: string,
  listener: (payload: PaymentStatusPayload) => void,
): () => void {
  const ch = channel(referenceId)
  emitter.on(ch, listener)
  void ensureRedis()
  return () => emitter.off(ch, listener)
}
