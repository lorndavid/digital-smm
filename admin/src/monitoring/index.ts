import { installGlobalErrorHandlers, captureError, captureMessage } from './errors'
import { initializeSentry, isSentryEnabled } from './sentry'
import type { App } from 'vue'
import type { Router } from 'vue-router'

/**
 * Admin monitoring — public API.
 *
 *   initMonitoring(app, router) — Sentry + global error hooks.
 *   captureError(err)           — report an error (no-op when disabled).
 *
 * Everything degrades gracefully: no DSN, dev mode or a blocked CDN simply
 * makes monitoring a no-op.
 */
export function initMonitoring(app?: App<Element>, router?: Router): void {
  initializeSentry(app, router)
  installGlobalErrorHandlers()
}

export { captureError, captureMessage, isSentryEnabled }
