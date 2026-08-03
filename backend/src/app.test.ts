import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Hoisted helpers — vi.mock factories are hoisted above imports, so shared
// values must be created via vi.hoisted.
// ---------------------------------------------------------------------------

const { apiError } = vi.hoisted(() => {
  // Shape-compatible with src/utils/api-error.ts so `instanceof` checks in
  // the error handler keep working under the mock.
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
  return { apiError: { ApiError } }
})

// The whole app imports the env module at load time; stub it so the tests
// never hit .env validation or real Clerk/Mongo connection strings.
// Keep this stub in sync if env.ts gains new fields.
vi.mock('./config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    PORT: 4000,
    MONGODB_URI: 'mongodb://localhost:27017/vidsmm_test',
    DNS_SERVERS: [],
    CLERK_JWKS_URL: 'https://example.clerk.accounts.dev/.well-known/jwks.json',
    CLERK_ISSUER: undefined,
    ADMIN_JWT_SECRET: 'test-admin-jwt-secret-0123456789',
    ADMIN_JWT_EXPIRES_IN: '1h',
    SUPER_ADMIN_EMAIL: undefined,
    SUPER_ADMIN_PASSWORD: undefined,
    CORS_ORIGINS: 'http://localhost:5173',
    SMM_PROVIDER: 'mock',
    SMMWIZ_API_URL: 'https://smmwiz.com/api/v2',
    SMMWIZ_API_KEY: 'test-key',
    PAYMENT_PROVIDER: 'mock',
    CUTLUY_API_URL: 'https://cutluy.com/v1',
    CUTLUY_API_KEY: '',
    CUTLUY_WEBHOOK_SECRET: '',
    ABAPAYWAY_API_URL: 'https://checkout.payway.com.kh/api/payment-gateway/v1/payments',
    ABAPAYWAY_MERCHANT_ID: '',
    ABAPAYWAY_API_KEY: '',
    ABAPAYWAY_RETURN_URL: 'http://localhost:5173',
    RATE_LIMIT_WINDOW_MS: 900_000,
    RATE_LIMIT_MAX: 300,
    ENABLE_ORDER_SYNC_JOB: false,
    ORDER_SYNC_INTERVAL_MS: 60_000,
  },
  corsOrigins: ['http://localhost:5173'],
}))

// Mock Clerk verification so auth tests are hermetic — no real JWKS fetch.
vi.mock('./config/clerk.js', () => ({
  verifyClerkToken: vi.fn(async () => {
    throw new apiError.ApiError(401, 'Invalid or expired session token')
  }),
}))

vi.mock('./utils/api-error.js', () => apiError)

import { createApp } from './app.js'

describe('VidSMM API', () => {
  it('GET /api/health reports ok (db disconnected in tests)', async () => {
    const res = await request(createApp()).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.service).toBe('vidsmm-backend')
    expect(res.body.db).toBe('disconnected')
  })

  it('returns 404 for unknown routes', async () => {
    const res = await request(createApp()).get('/api/does-not-exist')
    expect(res.status).toBe(404)
  })

  it('requires a session token on protected routes', async () => {
    const res = await request(createApp()).get('/api/orders')
    expect(res.status).toBe(401)
  })

  it('rejects invalid bearer tokens on protected routes', async () => {
    const res = await request(createApp())
      .get('/api/orders')
      .set('Authorization', 'Bearer not-a-real-token')
    expect(res.status).toBe(401)
  })

  it('allows the configured CORS origin', async () => {
    const res = await request(createApp())
      .get('/api/health')
      .set('Origin', 'http://localhost:5173')
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173')
  })

  it('blocks unknown CORS origins', async () => {
    const res = await request(createApp())
      .get('/api/health')
      .set('Origin', 'https://evil.example.com')
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })
})
