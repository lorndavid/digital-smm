import { describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import express, { type NextFunction, type Request, type Response } from 'express'
import { errorHandler, notFoundHandler } from './error.middleware.js'

// Stub env — the middleware reads NODE_ENV + SENTRY_DSN.
vi.mock('../config/env.js', () => ({
  env: { NODE_ENV: 'production', SENTRY_DSN: '' },
  corsOrigins: [],
}))

vi.mock('../utils/api-error.js', () => {
  class ApiError extends Error {
    constructor(
      public readonly statusCode: number,
      message: string,
      public readonly details?: unknown,
    ) {
      super(message)
      this.name = 'ApiError'
    }
  }
  return { ApiError }
})

vi.mock('../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

// Import after mocks so the mocked env is used.
import { ApiError } from '../utils/api-error.js'

function appWithRoute(handler: (req: Request, res: Response, next: NextFunction) => void) {
  const app = express()
  app.get('/boom', handler)
  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}

describe('error middleware — safe production responses', () => {
  it('returns ApiError status + message verbatim', async () => {
    const app = appWithRoute((_req, _res, next) => {
      next(new ApiError(404, 'Service not found'))
    })
    const res = await request(app).get('/boom')
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Service not found')
  })

  it('never leaks internal error messages in production', async () => {
    const app = appWithRoute((_req, _res, next) => {
      next(new Error('MONGODB_URI=mongodb+srv://user:supersecret@cluster:27017 — connection failed at /app/dist/index.js:123'))
    })
    const res = await request(app).get('/boom')
    expect(res.status).toBe(500)
    expect(res.body.error).toBe('Internal server error')
    // The secret must never reach the client.
    expect(JSON.stringify(res.body)).not.toContain('supersecret')
    expect(JSON.stringify(res.body)).not.toContain('mongodb+srv')
    expect(JSON.stringify(res.body)).not.toContain('node_modules')
  })

  it('maps validation errors to 400', async () => {
    const err = new Error('user validation failed') as Error & { name: string }
    err.name = 'ValidationError'
    const app = appWithRoute((_req, _res, next) => next(err))
    const res = await request(app).get('/boom')
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Validation error')
  })

  it('maps cast errors to 400 without internals', async () => {
    const err = new Error('Cast to ObjectId failed') as Error & { name: string }
    err.name = 'CastError'
    const app = appWithRoute((_req, _res, next) => next(err))
    const res = await request(app).get('/boom')
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Invalid identifier format')
  })

  it('maps duplicate-key errors to 409', async () => {
    const err = new Error('E11000 duplicate key') as Error & { code?: number }
    err.code = 11000
    const app = appWithRoute((_req, _res, next) => next(err))
    const res = await request(app).get('/boom')
    expect(res.status).toBe(409)
  })

  it('returns a safe 404 for unmatched routes', async () => {
    const app = appWithRoute((_req, _res) => undefined)
    const res = await request(app).get('/nope')
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Not found')
  })
})
