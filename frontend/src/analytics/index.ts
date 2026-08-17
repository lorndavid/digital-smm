import { analyticsConfig } from './config'
import { trackEvent, type AnalyticsEventName, type AnalyticsParams } from './events'
import { trackPageView, resetPageViewGuard } from './pageview'
import { getConsent, isTrackingAllowed, setConsent } from './consent'
import type { AnalyticsEnvironment } from './config'

/**
 * Public analytics API.
 *
 *   analytics.initialize()  — load the GA4 tag once (safe to call multiple
 *                             times; duplicates are guarded).
 *   analytics.pageView()    — track the current route (router afterEach).
 *   analytics.event()       — track a typed business event (sanitized).
 *
 * Architecture:
 *
 *   Vue components → analytics abstraction → GA4 (gtag)
 *
 * Components never touch the gtag/dataLayer implementation directly.
 * Everything fails gracefully: no measurement id, blocked storage or a
 * denied consent simply makes every call a no-op.
 */

let initialized = false

/**
 * Loads the Google tag (gtag.js) once. Idempotent — repeated calls are
 * ignored. Safe to call at app boot even when analytics is disabled.
 */
export function initialize(): void {
  if (initialized) return
  initialized = true

  const measurementId = analyticsConfig.measurementId
  if (!measurementId) return

  try {
    // Respect the stored opt-out before the tag loads.
    if (!isTrackingAllowed()) return

    const w = window as Window & {
      dataLayer?: unknown[]
      gtag?: (...args: unknown[]) => void
    }

    w.dataLayer = w.dataLayer || []

    const gtag = (...args: unknown[]) => {
      w.dataLayer!.push(args)
    }
    w.gtag = gtag

    // Mark the consent default so GA4 doesn't wait for an explicit update.
    w.gtag('consent', 'default', {
      analytics_storage: getConsent() === 'granted' ? 'granted' : 'denied',
    })
    w.gtag('js', new Date())
    w.gtag('config', measurementId, {
      send_page_view: false, // SPA sends page views manually via the router
    })

    const script = document.createElement('script')
    script.async = true
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`
    script.onerror = () => {
      // Analytics is best-effort — a blocked CDN must never break the app.
      w.gtag = undefined
    }
    document.head.appendChild(script)
  } catch {
    /* analytics must never break the application */
  }
}

/** Tracks the current page view (called by the router afterEach hook). */
export function pageView(params: AnalyticsParams = {}): void {
  trackPageView(params)
}

/** Tracks a typed, sanitized business event. */
export function event(name: AnalyticsEventName, params: AnalyticsParams = {}): void {
  trackEvent(name, params)
}

export { getConsent, setConsent, isTrackingAllowed, resetPageViewGuard }
export type { AnalyticsEventName, AnalyticsParams, AnalyticsEnvironment }
export { analyticsConfig }
