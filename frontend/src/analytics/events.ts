import { analyticsConfig } from './config'
import { isTrackingAllowed } from './consent'
import type { AnalyticsEvent, AnalyticsEventName, AnalyticsParams } from './types'

/**
 * Sanitized event tracking.
 *
 * Every event is filtered through a strict whitelist of business-level
 * parameters before it reaches GA4. Anything not in the whitelist is
 * dropped, so accidental leaks of tokens, links or private customer data
 * are impossible by construction.
 */

/** Keys allowed in analytics events. Anything else is stripped. */
const ALLOWED_KEYS = new Set<keyof AnalyticsParams>([
  'service_id',
  'platform',
  'category',
  'service_type',
  'order_type',
  'currency',
  'value',
  'quantity',
  'result',
  'provider',
  'search_term',
  'route_name',
  'order_status',
  'signed_in',
  'payment_status',
  'lcp',
  'cls',
  'inp',
  'ttfb',
])

/** Caps for free-text params (search terms must never be huge). */
const MAX_SEARCH_TERM = 80

function sanitizeParams(params: AnalyticsParams): AnalyticsParams {
  // Internal loose record avoids TS's indexed-assignment narrowness; the
  // returned value is still typed as AnalyticsParams.
  const clean: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(params) as Array<[keyof AnalyticsParams, unknown]>) {
    if (!ALLOWED_KEYS.has(key)) continue
    if (value === undefined || value === null || value === '') continue
    if (typeof value === 'string') {
      // Strip control characters that could corrupt the payload.
      const text = value.replace(/[\u0000-\u001f\u007f]/g, '').trim()
      if (!text) continue
      if (key === 'search_term') clean[key] = text.slice(0, MAX_SEARCH_TERM)
      else clean[key] = text
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      clean[key] = value
    } else if (typeof value === 'boolean') {
      clean[key] = value
    }
  }
  return clean as AnalyticsParams
}

/** Sends a typed, sanitized event to GA4 (no-op when disabled). */
export function trackEvent(name: AnalyticsEventName, params: AnalyticsParams = {}): void {
  if (!analyticsConfig.enabled || !isTrackingAllowed()) return
  const w = window as Window & { dataLayer?: unknown[] }
  if (!w.dataLayer) return
  const event: AnalyticsEvent = { name, params: sanitizeParams(params) }
  w.dataLayer.push({
    event: event.name,
    app_environment: analyticsConfig.environment,
    ...event.params,
  })
}

/** Public typing guard used by callers to keep events typed. */
export type { AnalyticsEventName, AnalyticsParams }
