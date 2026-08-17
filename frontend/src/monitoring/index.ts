import { collectWebVitals } from './performance'
import { installGlobalErrorHandlers, captureError, captureMessage } from './errors'
import { initializeSentry, isSentryEnabled } from './sentry'
import type { App } from 'vue'
import type { Router } from 'vue-router'

/**
 * Frontend monitoring — public API.
 *
 *   initMonitoring(app, router) — Sentry + global error hooks + web vitals.
 *   captureError(err)           — report an error (no-op when disabled).
 *
 * Architecture:
 *
 *   Vue app / window errors → monitoring module → Sentry (+ analytics RUM)
 *
 * Everything degrades gracefully: no DSN, dev mode or a blocked CDN simply
 * makes monitoring a no-op.
 */
export function initMonitoring(app?: App<Element>, router?: Router): void {
  initializeSentry(app, router)
  installGlobalErrorHandlers()
  collectWebVitals()
}

export { captureError, captureMessage, isSentryEnabled }
