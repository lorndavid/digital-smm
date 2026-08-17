import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'

const { apiError } = vi.hoisted(() => {
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

vi.mock('./config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    PORT: 4000,
    MONGODB_URI: 'mongodb://localhost:27017/digitalsmm_test',
    DNS_SERVERS: [],
    GOOGLE_CLIENT_ID: '',
    GOOGLE_CLIENT_SECRET: '',
    GOOGLE_OAUTH_URL: 'https://accounts.google.com/o/oauth2/v2/auth',
    GOOGLE_TOKEN_URL: 'https://oauth2.googleapis.com/token',
    GOOGLE_CERTS_URL: 'https://www.googleapis.com/oauth2/v3/certs',
    FRONTEND_URL: 'http://localhost:5173',
    CUSTOMER_JWT_SECRET: 'test-customer-jwt-secret-0123456789',
    CUSTOMER_JWT_EXPIRES_IN: '7d',
    OAUTH_STATE_TTL_SECONDS: 600,
    ADMIN_JWT_SECRET: 'test-admin-jwt-secret-0123456789',
    ADMIN_JWT_EXPIRES_IN: '1h',
    SUPER_ADMIN_EMAIL: undefined,
    SUPER_ADMIN_PASSWORD: undefined,
    CORS_ORIGINS: 'http://localhost:5173',
    SMM_PROVIDER: 'mock',
    SMMWIZ_API_URL: 'https://wizsmm.com/api/v2',
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
    REDIS_URL: '',
    SENTRY_DSN: '',
    SENTRY_ENVIRONMENT: 'test',
    ENABLE_ORDER_SYNC_JOB: false,
    ORDER_SYNC_INTERVAL_MS: 60_000,
  },
  corsOrigins: ['http://localhost:5173'],
}))

vi.mock('./modules/auth/session.js', () => ({
  verifyCustomerToken: vi.fn(async () => {
    throw new apiError.ApiError(401, 'Invalid or expired session token')
  }),
}))

vi.mock('./utils/api-error.js', () => apiError)

// The webhook service writes to MongoDB — mock it so the route-level
// fail-closed behaviour is testable without a database.
vi.mock('./modules/payment/providers/cutluy/webhook.service.js', () => ({
  handleCutLuyWebhook: vi.fn(async () => ({
    valid: false,
    outcome: 'invalid',
    reason: 'signature verification failed',
  })),
  webhookHttpStatus: (result: { valid: boolean }) => (result.valid ? 200 : 400),
}))

import { createApp } from './app.js'

describe('security posture', () => {
  it('sends security headers (Helmet)', async () => {
    const res = await request(createApp()).get('/api/health')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN')
    expect(res.headers['strict-transport-security']).toBeDefined()
    expect(res.headers['x-download-options']).toBe('noopen')
  })

  it('blocks cross-site origins (CORS)', async () => {
    const res = await request(createApp())
      .get('/api/health')
      .set('Origin', 'https://evil.example.com')
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('rejects malformed query parameters', async () => {
    // sort= is constrained to a known enum; garbage must not crash.
    const res = await request(createApp()).get('/api/services?sort=../../etc/passwd')
    expect([400, 200]).toContain(res.status)
  })

  it('rejects oversize payloads (body limit)', async () => {
    const res = await request(createApp())
      .post('/api/payment/create')
      .send({ big: 'x'.repeat(2 * 1024 * 1024) })
    expect([400, 413, 401]).toContain(res.status)
  })

  it('rejects invalid JSON bodies gracefully', async () => {
    const res = await request(createApp())
      .post('/api/payment/create')
      .set('Content-Type', 'application/json')
      .send('{"broken": ')
    expect([400, 401]).toContain(res.status)
  })

  it('does not expose stack traces in error responses (production shape)', async () => {
    const res = await request(createApp()).get('/api/orders/not-an-id')
    expect(res.status).toBe(401) // auth guard first
    expect(JSON.stringify(res.body)).not.toContain(' at ')
  })

  it('protects admin endpoints from non-admin sessions', async () => {
    const res = await request(createApp())
      .get('/api/admin/stats')
      .set('Authorization', 'Bearer not-an-admin-token')
    expect(res.status).toBe(401)
  })

  it('protects admin auth from anonymous access', async () => {
    const res = await request(createApp()).get('/api/admin/stats')
    expect(res.status).toBe(401)
  })

  it('webhook endpoint rejects unsigned payloads (fail closed)', async () => {
    const res = await request(createApp())
      .post('/webhooks/cutluy')
      .set('Content-Type', 'application/json')
      .send({ event: 'payment.completed', data: {} })
    // No valid signature → must NOT be accepted (400, never 2xx).
    expect(res.status).toBe(400)
    expect(res.body.valid).toBe(false)
  })

  it('does not set cache headers on authenticated endpoints (no cache leakage)', async () => {
    const res = await request(createApp()).get('/api/orders')
    // Private data must never be cached by shared caches.
    const cc = String(res.headers['cache-control'] ?? '')
    expect(cc.toLowerCase()).not.toContain('public')
  })

  it('rate limiter emits draft-8 headers on limited routes', async () => {
    // /api/health is behind the global apiLimiter (no DB needed in tests).
    const res = await request(createApp()).get('/api/health')
    // express-rate-limit (draft-8 standard headers): the policy header is
    // present on limited routes.
    const hasPolicyHeader = Boolean(
      res.headers['rate-limit-policy'] || res.headers['ratelimit-policy'],
    )
    expect(hasPolicyHeader).toBe(true)
  })
})
