import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import { corsOrigins, env } from './config/env.js'
import { apiRoutes } from './routes/index.js'
import { webhookRoutes } from './routes/webhook.routes.js'
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js'
import { requestContextMiddleware } from './middleware/request-context.middleware.js'
import { requestMetricsMiddleware } from './middleware/request-metrics.middleware.js'

/**
 * Builds the Express application. Security posture: Helmet headers,
 * strict CORS, JSON body limits and a centralized error handler. Auth
 * routes bypass the rate limiter (see routes/index.ts); all other /api
 * routes are rate-limited there. Provider webhooks live under /webhooks
 * and are mounted BEFORE express.json so signature verification can read
 * the raw request body.
 *
 * Request correlation: every request gets a requestId (AsyncLocalStorage)
 * and one structured log line + metrics entry — see
 * middleware/request-context.middleware.ts and request-metrics.middleware.ts.
 */
export function createApp() {
  const app = express()

  app.set('trust proxy', 1)

  // Correlate logs/errors/metrics per request (must be first).
  app.use(requestContextMiddleware)

  app.use(helmet())
  app.use(
    cors({
      origin: corsOrigins,
      credentials: true,
    }),
  )

  // Provider webhooks (raw body, signature verified, no auth — CutLuy signs).
  app.use('/webhooks', webhookRoutes)

  app.use(express.json({ limit: '1mb' }))
  app.use(express.urlencoded({ extended: false }))

  app.get('/', (_req, res) => {
    res.json({ status: 'ok', service: 'DigitalSMM Backend', version: '1.0.0' })
  })
  app.get('/favicon.ico', (_req, res) => {
    res.status(204).end()
  })

  app.use('/api', apiRoutes)

  // Request monitoring — mounted after routing so 404s/500s are measured too.
  app.use(requestMetricsMiddleware)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}

export { env }
