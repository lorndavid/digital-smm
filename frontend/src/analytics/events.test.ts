import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { trackEvent } from './events'
import { analyticsConfig } from './config'
import { isTrackingAllowed, setConsent } from './consent'

// Node environment — provide the minimal browser globals the modules use.
const win = globalThis as unknown as {
  dataLayer?: unknown[]
  localStorage?: Storage
  location?: { pathname: string }
}
// The modules reference `window` directly — alias it to the global object.
;(globalThis as unknown as { window?: unknown }).window = globalThis
win.dataLayer = []
const storage = new Map<string, string>()
win.localStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => void storage.set(key, value),
  removeItem: (key: string) => void storage.delete(key),
  clear: () => storage.clear(),
  key: (index: number) => [...storage.keys()][index] ?? null,
  get length() {
    return storage.size
  },
} as Storage
win.location = { pathname: '/' }

// Analytics modules read Vite's `import.meta.env` — vi.stubEnv controls it.
// Default: a measurement id present so most tests exercise the enabled path.
beforeEach(() => {
  vi.stubEnv('VITE_APP_ENV', 'development')
  vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TEST123')
  win.dataLayer = []
  setConsent('granted')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('analytics event tracking', () => {
  function dataLayer(): unknown[] {
    return win.dataLayer ?? []
  }

  it('pushes a typed event to the data layer when enabled', () => {
    trackEvent('login', { signed_in: true })
    const events = dataLayer()
    expect(events).toHaveLength(1)
    const pushed = events[0] as Record<string, unknown>
    expect(pushed.event).toBe('login')
    expect(pushed.signed_in).toBe(true)
  })

  it('strips keys outside the whitelist (privacy filtering)', () => {
    trackEvent('login', {
      signed_in: true,
      password: 'hunter2',
      authorization: 'Bearer abc.def.ghi',
      email: 'victim@example.com',
      link: 'https://tiktok.com/@user',
    } as never)
    const pushed = dataLayer()[0] as Record<string, unknown>
    expect(pushed.password).toBeUndefined()
    expect(pushed.authorization).toBeUndefined()
    expect(pushed.email).toBeUndefined()
    expect(pushed.link).toBeUndefined()
    expect(pushed.signed_in).toBe(true)
  })

  it('keeps only business-level fields', () => {
    trackEvent('order_create', {
      service_id: 'svc_123',
      platform: 'tiktok',
      currency: 'USD',
      value: 4.2,
      signed_in: true,
    })
    const pushed = dataLayer()[0] as Record<string, unknown>
    expect(pushed.service_id).toBe('svc_123')
    expect(pushed.platform).toBe('tiktok')
    expect(pushed.currency).toBe('USD')
    expect(pushed.value).toBe(4.2)
  })

  it('caps and trims free-text search terms', () => {
    const huge = 'a'.repeat(200)
    trackEvent('service_search', { search_term: `  ${huge}  ` })
    const pushed = dataLayer()[0] as Record<string, unknown>
    expect(String(pushed.search_term)).toHaveLength(80)
  })

  it('is a no-op when no measurement id is configured', () => {
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', '')
    trackEvent('login', { signed_in: true })
    expect(dataLayer()).toHaveLength(0)
  })

  it('respects the stored consent opt-out', () => {
    setConsent('denied')
    expect(isTrackingAllowed()).toBe(false)
    trackEvent('login', { signed_in: true })
    expect(dataLayer()).toHaveLength(0)
  })

  it('does not push when dataLayer is unavailable', () => {
    delete (globalThis as unknown as Record<string, unknown>).dataLayer
    trackEvent('login', { signed_in: true })
    expect(win.dataLayer ?? []).toHaveLength(0)
  })
})

describe('analytics config', () => {
  it('reads the measurement id + env from import.meta.env', () => {
    expect(analyticsConfig.measurementId).toBe('G-TEST123')
    expect(analyticsConfig.enabled).toBe(true)
    expect(analyticsConfig.environment).toBe('development')
  })
})
