import { collectWebVitals } from './performance'
import { installGlobalErrorHandlers } from './errors'
import { initializeSentry } from './sentry'

/**
 * Real User Monitoring — the single entry point that ties together:
 *   - Sentry (error + performance monitoring, when a DSN is configured)
 *   - Web Vitals collection (LCP / CLS / INP / TTFB → analytics)
 *   - global error handlers (uncaught exceptions / rejections)
 *
 * Call once at app boot. Every component fails gracefully when the
 * corresponding SDK or configuration is missing.
 */
export function initMonitoring(): void {
  initializeSentry()
  installGlobalErrorHandlers()
  collectWebVitals()
}
