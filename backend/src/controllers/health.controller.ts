import { isDatabaseConnected } from '../config/database.js'
import { env } from '../config/env.js'
import { asyncHandler } from '../utils/async-handler.js'
import { getRedisClient } from '../services/redis/redis.client.js'
import { metricsStore } from '../services/monitoring/metrics.store.js'
import { getSmmProvider } from '../services/smm/provider.factory.js'

/**
 * Health endpoints.
 *
 * Three levels, kept deliberately separate so load balancers / orchestrators
 * can probe the right one:
 *
 *   GET /api/health      — liveness: the process is up. No dependency checks.
 *   GET /api/ready       — readiness: dependencies (MongoDB, Redis when
 *                          configured) are reachable. An unhealthy dependency
 *                          → 503, so orchestrators stop routing traffic.
 *   GET /api/health/deps — dependency health detail (admin UI): per-dependency
 *                          status WITHOUT failing the request, so the admin
 *                          panel can show Healthy/Warning/Degraded.
 *
 * Nothing sensitive (credentials, URIs with passwords, provider keys) is
 * ever returned.
 */

export const healthController = {
  /** Liveness — always 200 while the process is alive. */
  check: asyncHandler(async (_req, res) => {
    res.json({
      status: 'ok',
      service: 'digitalsmm-backend',
      db: isDatabaseConnected() ? 'connected' : 'disconnected',
      smmProvider: env.SMM_PROVIDER,
      paymentProvider: env.PAYMENT_PROVIDER,
      time: new Date().toISOString(),
    })
  }),

  /** Readiness — 200 only when required dependencies are reachable. */
  ready: asyncHandler(async (_req, res) => {
    const dbOk = isDatabaseConnected()

    // Redis is OPTIONAL — only fail readiness when it is configured but down.
    let redisOk = true
    let redisConfigured = Boolean(env.REDIS_URL)
    if (redisConfigured) {
      redisOk = Boolean(await getRedisClient())
    }

    const ok = dbOk && redisOk
    res.status(ok ? 200 : 503).json({
      status: ok ? 'ok' : 'unavailable',
      service: 'digitalsmm-backend',
      dependencies: {
        mongodb: dbOk ? 'ok' : 'down',
        redis: redisConfigured ? (redisOk ? 'ok' : 'down') : 'not-configured',
      },
      time: new Date().toISOString(),
    })
  }),

  /** Request metrics summary (admin System Health page). */
  metrics: asyncHandler(async (_req, res) => {
    res.json(metricsStore.summary())
  }),

  /** Dependency health detail — never fails the request (admin UI feeds). */
  deps: asyncHandler(async (_req, res) => {
    const dbOk = isDatabaseConnected()
    const redisConfigured = Boolean(env.REDIS_URL)
    const redisOk = redisConfigured ? Boolean(await getRedisClient()) : true

    // Critical external provider availability — only the CONFIGURED provider
    // is probed, cheaply (balance call), and the result is advisory.
    let smmOk = true
    let smmError: string | null = null
    if (env.SMM_PROVIDER === 'smmwiz') {
      try {
        await getSmmProvider().getBalance()
      } catch (err) {
        smmOk = false
        smmError = err instanceof Error ? err.message : 'unavailable'
      }
    }

    res.json({
      status: dbOk && (redisOk || !redisConfigured) ? 'ok' : 'degraded',
      service: 'digitalsmm-backend',
      version: '1.0.0',
      uptimeSeconds: metricsStore.summary().uptimeSeconds,
      dependencies: {
        mongodb: { status: dbOk ? 'ok' : 'down' },
        redis: {
          status: redisConfigured ? (redisOk ? 'ok' : 'down') : 'not-configured',
        },
        smmProvider: {
          status: smmOk ? 'ok' : 'degraded',
          provider: env.SMM_PROVIDER,
          ...(smmError ? { error: smmError.slice(0, 200) } : {}),
        },
        paymentProvider: { status: 'ok', provider: env.PAYMENT_PROVIDER },
      },
      time: new Date().toISOString(),
    })
  }),
}
