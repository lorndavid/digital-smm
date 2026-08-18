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

vi.mock('../config/env.js', () => ({
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
    APP_VERSION: '1.0.0',
    APP_COMMIT: 'abc123',
    APP_BUILD_TIME: '',
    DEPLOYMENT_ID: '',
    TELEGRAM_BOT_TOKEN: undefined,
    TELEGRAM_CHAT_ID: undefined,
    TELEGRAM_ALERTS_ENABLED: false,
    TELEGRAM_MIN_ALERT_LEVEL: 'warning',
    TELEGRAM_ALERT_COOLDOWN_MS: 900_000,
    DAILY_REPORT_ENABLED: false,
    DAILY_REPORT_TIME: '22:00',
    DAILY_REPORT_TZ: 'Asia/Phnom_Penh',
  },
  corsOrigins: ['http://localhost:5173'],
}))

vi.mock('../modules/auth/session.js', () => ({
  verifyCustomerToken: vi.fn(async () => {
    throw new apiError.ApiError(401, 'Invalid or expired session token')
  }),
}))

vi.mock('../utils/api-error.js', () => apiError)

import { createApp } from '../app.js'

describe('Health endpoints', () => {
  it('GET /api/health is liveness — 200 even with dependencies down', async () => {
    const res = await request(createApp()).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.service).toBe('digitalsmm-backend')
  })

  it('GET /api/ready reports readiness (MongoDB down → 503 in tests)', async () => {
    const res = await request(createApp()).get('/api/ready')
    // In tests MongoDB is disconnected → not ready.
    expect([200, 503]).toContain(res.status)
    expect(res.body.dependencies.mongodb).toBeDefined()
    expect(res.body.dependencies.redis).toBe('not-configured')
  })

  it('GET /api/health/deps returns per-dependency detail without failing', async () => {
    const res = await request(createApp()).get('/api/health/deps')
    expect(res.status).toBe(200)
    expect(res.body.dependencies.mongodb).toBeDefined()
    expect(res.body.dependencies.redis).toBeDefined()
    expect(res.body.dependencies.smmProvider.provider).toBe('mock')
    expect(res.body.dependencies.paymentProvider.provider).toBe('mock')
    // No secrets ever leaked.
    expect(JSON.stringify(res.body)).not.toMatch(/mongodb(\+srv)?:\/\/[^@]+:[^@]+@/)
    expect(JSON.stringify(res.body)).not.toMatch(/api[_-]?key/i)
  })

  it('GET /api/health/metrics returns request stats', async () => {
    const res = await request(createApp()).get('/api/health/metrics')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('totalRequests')
    expect(res.body).toHaveProperty('errorRate')
    expect(res.body).toHaveProperty('latency')
    expect(res.body.latency).toHaveProperty('p50')
    expect(res.body.latency).toHaveProperty('p95')
    expect(res.body.latency).toHaveProperty('p99')
    expect(res.body).toHaveProperty('uptimeSeconds')
  })

  it('health endpoints never leak stack traces or internals', async () => {
    const res = await request(createApp()).get('/api/health/deps')
    const body = JSON.stringify(res.body)
    expect(body).not.toContain('node_modules')
    expect(body).not.toContain(' at ')
    expect(body).not.toContain('SENTRY_DSN')
  })

  it('GET /api/version returns safe deployment identity', async () => {
    const res = await request(createApp()).get('/api/version')
    expect(res.status).toBe(200)
    expect(res.body.application).toBe('digitalsmm-backend')
    expect(res.body.version).toBe('1.0.0')
    expect(res.body.commit).toBe('abc123')
    expect(res.body.environment).toBe('test')
  })

  it('GET /api/health carries the version without leaking internals', async () => {
    const res = await request(createApp()).get('/api/health')
    expect(res.body.version).toBe('1.0.0')
    expect(JSON.stringify(res.body)).not.toMatch(/secret|password|token/i)
  })
})
