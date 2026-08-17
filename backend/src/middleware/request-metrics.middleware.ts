import type { RequestHandler } from 'express'
import { metricsStore } from '../services/monitoring/metrics.store.js'
import { setRequestRoute } from '../utils/request-context.js'
import { logger } from '../utils/logger.js'

/** Sensitive headers never logged even in dev. */
const SENSITIVE_HEADERS = new Set([
  'authorization',
  'cookie',
  'x-api-key',
  'x-webhook-secret',
  'x-cutluy-signature',
])

/**
 * Central request monitoring middleware.
 *
 * Records method / route / status / duration into the metrics store and
 * emits a single structured log line per request (with requestId). Runs
 * AFTER routing is resolved so `req.route` gives the template — Express
 * exposes it on the route layer the request actually matched.
 *
 * Must be mounted after the router (or as the last middleware before the
 * error handler) so 404s/500s are still measured.
 */
export const requestMetricsMiddleware: RequestHandler = (req, res, next) => {
  const startedAt = process.hrtime.bigint()

  // Capture the route template once the request matched a route.
  const routeTemplate = req.route?.path ?? req.baseUrl ?? req.path
  setRequestRoute(routeTemplate)

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6
    const status = res.statusCode
    const method = req.method
    const route = routeTemplate

    metricsStore.record(method, route, status, durationMs)

    // One structured line per request (no bodies, no sensitive headers).
    logger.info('request', {
      method,
      route,
      status,
      duration_ms: Math.round(durationMs),
      ...(status >= 500 ? { level: 'error' } : {}),
    })
  })

  // Suppress morgan's noisy per-request lines — the structured logger above
  // is the single request log source.
  next()
}

export { SENSITIVE_HEADERS }
