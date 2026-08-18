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
// never hit .env validation or real Google/Mongo connection strings.
// Keep this stub in sync if env.ts gains new fields.
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
    ENABLE_ORDER_SYNC_JOB: false,
    ORDER_SYNC_INTERVAL_MS: 60_000,
    APP_VERSION: '1.0.0',
    APP_COMMIT: '',
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

// Mock customer session verification so auth tests are hermetic — no real
// token signing/verification round-trips against CUSTOMER_JWT_SECRET.
vi.mock('./modules/auth/session.js', () => ({
  verifyCustomerToken: vi.fn(async () => {
    throw new apiError.ApiError(401, 'Invalid or expired session token')
  }),
}))

vi.mock('./utils/api-error.js', () => apiError)

import { createApp } from './app.js'

describe('DigitalSMM API', () => {
  it('GET /api/health reports ok (db disconnected in tests)', async () => {
    const res = await request(createApp()).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.service).toBe('digitalsmm-backend')
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
