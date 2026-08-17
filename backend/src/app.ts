import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import morgan from 'morgan'
import { corsOrigins, env } from './config/env.js'
import { apiRoutes } from './routes/index.js'
import { webhookRoutes } from './routes/webhook.routes.js'
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js'

/**
 * Builds the Express application. Security posture: Helmet headers,
 * strict CORS, JSON body limits and a centralized error handler. Auth
 * routes bypass the rate limiter (see routes/index.ts); all other /api
 * routes are rate-limited there. Provider webhooks live under /webhooks
 * and are mounted BEFORE express.json so signature verification can read
 * the raw request body.
 */
export function createApp() {
  const app = express()

  app.set('trust proxy', 1)

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

  app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'))

  app.get('/', (_req, res) => {
    res.json({ status: 'ok', service: 'DigitalSMM Backend', version: '1.0.0' })
  })
  app.get('/favicon.ico', (_req, res) => {
    res.status(204).end()
  })

  app.use('/api', apiRoutes)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
