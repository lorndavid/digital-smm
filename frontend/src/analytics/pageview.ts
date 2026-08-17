import { analyticsConfig } from './config'
import { isTrackingAllowed } from './consent'
import type { AnalyticsParams } from './types'

/**
 * Page-view tracking for the SPA.
 *
 * GA4 measures page views via the `page_view` event. For SPAs we send it
 * manually on route transitions (see router afterEach hook) so every route
 * change — not just full page loads — is counted. The current route name and
 * path are attached as business-level params only; query strings are
 * deliberately excluded to avoid cardinality explosion from sort/filter
 * parameters.
 */

declare global {
  interface Window {
    dataLayer?: unknown[]
  }
}

let lastTracked = ''

/** Tracks a page view for a route transition. Dedupes identical routes. */
export function trackPageView(params: AnalyticsParams = {}): void {
  if (!analyticsConfig.enabled || !isTrackingAllowed()) return
  const w = window
  if (!w.dataLayer) return

  const path = w.location.pathname
  if (path === lastTracked) return
  lastTracked = path

  w.dataLayer.push({
    event: 'page_view',
    page_path: path,
    page_title: typeof document !== 'undefined' ? document.title : undefined,
    app_environment: analyticsConfig.environment,
    ...params,
  })
}

/** Resets the dedupe guard (used on hard reload where the route stays the same). */
export function resetPageViewGuard(): void {
  lastTracked = ''
}
