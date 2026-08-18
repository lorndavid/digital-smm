import { describe, expect, it, vi } from 'vitest'

// env must be stubbed before the module graph loads (env.ts validates
// process.env and would exit the process otherwise).
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

import {
  buildDailyReport,
  currentTimeInTz,
  dayKeyInTz,
  startOfTodayInTz,
  type DailyReportData,
} from './daily-report.job.js'

const data: DailyReportData = {
  environment: 'production',
  version: '1.2.3',
  commit: 'abc123def456',
  dbConnected: true,
  smmProvider: 'smmwiz',
  paymentProvider: 'cutluy',
  uptimeSeconds: 3661,
  requests: 100,
  errors: 0,
  errorRate: 0,
  latency: { p50: 50, p95: 120, p99: 200 },
  ordersToday: 5,
  paymentsToday: { paid: 4, pending: 1 },
  revenueTodayUsd: 40,
  openIncidents: 0,
  deployments: { frontend: null, admin: null, backend: null },
}

describe('buildDailyReport', () => {
  it('contains the header, environment and system status', () => {
    const text = buildDailyReport(data).join('\n')
    expect(text).toContain('Daily System Report')
    expect(text).toContain('Environment: production')
    expect(text).toContain('SMM provider: smmwiz')
    expect(text).toContain('🟢 HEALTHY')
  })

  it('reports traffic, performance and business numbers from real data', () => {
    const text = buildDailyReport(data).join('\n')
    expect(text).toContain('Requests: 100')
    expect(text).toContain('Error rate: 0.00%')
    expect(text).toContain('p95: 120ms')
    expect(text).toContain('Orders: 5')
    expect(text).toContain('Revenue: $40.00')
    expect(text).toContain('paid: 4')
  })

  it('shows DEGRADED when open incidents or recent errors exist', () => {
    const degraded = buildDailyReport({ ...data, openIncidents: 1, errors: 2, errorRate: 0.02 }).join(
      '\n',
    )
    expect(degraded).toContain('Open: 1')
    expect(degraded).toContain('DEGRADED')
  })

  it('never includes secrets or credentials', () => {
    const text = buildDailyReport(data).join('\n')
    expect(text).not.toMatch(/mongodb(\+srv)?:\/\/[^@]+@/)
    expect(text).not.toMatch(/secret|token|password/i)
  })
})

describe('timezone helpers', () => {
  it('startOfTodayInTz returns a UTC Date at midnight of the Cambodia day', () => {
    const start = startOfTodayInTz('Asia/Phnom_Penh')
    expect(start).toBeInstanceOf(Date)
    expect(start.toISOString()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:00:00/)
  })

  it('currentTimeInTz returns HH:mm in the configured zone', () => {
    expect(currentTimeInTz('Asia/Phnom_Penh')).toMatch(/^\d{2}:\d{2}$/)
  })

  it('dayKeyInTz returns YYYY-MM-DD', () => {
    expect(dayKeyInTz('Asia/Phnom_Penh')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
