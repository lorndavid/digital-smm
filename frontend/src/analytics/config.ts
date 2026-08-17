/**
 * Analytics configuration.
 *
 * All settings are derived from PUBLIC VITE_* environment variables. The
 * measurement id is safe to embed in the browser bundle — never put
 * secrets here.
 */

/** App environment tag used for analytics/Sentry labels. */
export type AnalyticsEnvironment = 'development' | 'staging' | 'production'

function detectEnvironment(): AnalyticsEnvironment {
  const raw = (import.meta.env.VITE_APP_ENV ?? '').trim().toLowerCase()
  if (raw === 'staging' || raw === 'production') return raw
  // In production builds without an explicit tag, be conservative and tag
  // as production so events are never mislabelled as development.
  if (import.meta.env.PROD) return 'production'
  return 'development'
}

export const analyticsConfig = {
  /** GA4 Measurement ID — empty disables all analytics safely. */
  get measurementId(): string {
    return (import.meta.env.VITE_GA_MEASUREMENT_ID ?? '').trim()
  },

  /** True when analytics may load (a measurement id is configured). */
  get enabled(): boolean {
    return Boolean(this.measurementId)
  },

  get environment(): AnalyticsEnvironment {
    return detectEnvironment()
  },

  /** Global function name used by the GA4 gtag loader. */
  get globalName(): string {
    return 'dataLayer'
  },
} as const

/** Default event currency for ecommerce-adjacent events (business value). */
export const ANALYTICS_CURRENCY = 'USD'
