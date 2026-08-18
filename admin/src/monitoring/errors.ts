/**
 * Admin error capture.
 *
 * Hooks global error handlers so uncaught exceptions, unhandled promise
 * rejections and Vue errors are reported to Sentry (when configured) and
 * never crash silently. Captures are best-effort — a failure to report is
 * swallowed, and raw error messages are scrubbed of obvious secrets.
 */

import * as Sentry from '@sentry/vue'

/** Values that must never reach an error monitor. */
const SECRET_PATTERNS = [
  /(?:authorization|bearer)\s+[a-z0-9._-]+/gi,
  /password\s*[:=]\s*\S+/gi,
  /(?:api[_-]?key|secret|token)\s*[:=]\s*\S+/gi,
  /(?:GOCSPX-|whsec_|ck_live_|ak_live_|sk_live_)\S*/g,
]

/** Scrubs obvious secrets from a message before reporting. */
export function scrubMessage(message: string): string {
  let out = message
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, '[REDACTED]')
  }
  return out.slice(0, 2000)
}

/** Sends an error to Sentry (no-op when Sentry is disabled). */
export function captureError(error: unknown, context?: Record<string, unknown>): void {
  try {
    Sentry.captureException(error, { extra: context })
  } catch {
    /* never throw from the error hook */
  }
}

/** Sends a message-level event to Sentry. */
export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
  try {
    Sentry.captureMessage(scrubMessage(message), level)
  } catch {
    /* noop */
  }
}

/**
 * Installs the global error hooks. Safe to call once at app boot; guard
 * against double installation.
 */
export function installGlobalErrorHandlers(): void {
  if (typeof window === 'undefined') return

  const hasErrorListeners = window.__DIGITALSMM_ADMIN_ERROR_HOOKS_INSTALLED__
  if (hasErrorListeners) return
  window.__DIGITALSMM_ADMIN_ERROR_HOOKS_INSTALLED__ = true

  window.addEventListener('error', (event) => {
    if (event?.error) {
      captureError(event.error)
    } else {
      captureMessage(`window error: ${scrubMessage(event?.message ?? 'unknown')}`, 'error')
    }
  })

  window.addEventListener('unhandledrejection', (event) => {
    captureError(event?.reason ?? new Error('Unhandled promise rejection'))
  })
}

declare global {
  interface Window {
    __DIGITALSMM_ADMIN_ERROR_HOOKS_INSTALLED__?: boolean
  }
}
