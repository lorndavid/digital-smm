import { beforeEach, describe, expect, it, vi } from 'vitest'

// env is read at import time — stub it with an empty DSN so init is a no-op.
vi.mock('./env.js', () => ({
  env: {
    NODE_ENV: 'test',
    SENTRY_DSN: '',
    SENTRY_ENVIRONMENT: 'test',
  },
}))

// Mock the SDK so we can assert init was called (or skipped).
const initMock = vi.fn()
vi.mock('@sentry/node', () => ({
  init: (...args: unknown[]) => initMock(...args),
  getCurrentScope: () => ({ addEventProcessor: vi.fn() }),
}))

import { initSentry, isSentryEnabled } from './sentry.js'

describe('Sentry backend init', () => {
  beforeEach(() => {
    initMock.mockClear()
  })

  it('is disabled when no DSN is configured', () => {
    initSentry()
    expect(initMock).not.toHaveBeenCalled()
    expect(isSentryEnabled()).toBe(false)
  })

  it('initializes once with the SDK when a DSN is present', async () => {
    // Re-mock the module with a DSN to test the enabled path.
    vi.resetModules()
    vi.doMock('./env.js', () => ({
      env: { NODE_ENV: 'production', SENTRY_DSN: 'https://abc@sentry.example/123', SENTRY_ENVIRONMENT: 'production' },
    }))
    vi.doMock('@sentry/node', () => ({
      init: (...args: unknown[]) => initMock(...args),
      getCurrentScope: () => ({ addEventProcessor: vi.fn() }),
    }))
    const mod = await import('./sentry.js')
    mod.initSentry()
    expect(initMock).toHaveBeenCalledTimes(1)
    const [config] = initMock.mock.calls[0] as [{ environment?: string; dsn?: string }]
    expect(config.dsn).toBe('https://abc@sentry.example/123')
    expect(config.environment).toBe('production')
  })

  it('is idempotent — second call does not re-init', async () => {
    vi.resetModules()
    vi.doMock('./env.js', () => ({
      env: { NODE_ENV: 'production', SENTRY_DSN: 'https://abc@sentry.example/123', SENTRY_ENVIRONMENT: 'staging' },
    }))
    vi.doMock('@sentry/node', () => ({
      init: (...args: unknown[]) => initMock(...args),
      getCurrentScope: () => ({ addEventProcessor: vi.fn() }),
    }))
    const mod = await import('./sentry.js')
    mod.initSentry()
    mod.initSentry()
    expect(initMock).toHaveBeenCalledTimes(1)
  })
})
