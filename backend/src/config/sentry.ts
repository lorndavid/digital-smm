import * as Sentry from '@sentry/node'
import { env } from './env.js'
import { getRequestId } from '../utils/request-context.js'

/**
 * Sentry backend initialization.
 *
 * SENTRY_DSN is a SERVER-ONLY secret — it is never exposed to browsers.
 * Enabled only when a DSN is configured (never in tests); errors still go
 * to the structured logger when Sentry is off, so monitoring degrades
 * gracefully.
 */

let initialized = false

/** Initializes Sentry for the backend. Idempotent, non-fatal. */
export function initSentry(): void {
  if (initialized) return
  const dsn = (env.SENTRY_DSN ?? '').trim()
  if (!dsn || env.NODE_ENV === 'test') return

  initialized = true

  try {
    Sentry.init({
      dsn,
      environment: env.SENTRY_ENVIRONMENT,
      release: `digitalsmm-backend@${env.SENTRY_ENVIRONMENT}`,
      tracesSampleRate: 0.05,
      beforeSend(event) {
        // Drop sensitive request headers from captured events.
        const headers = event.request?.headers
        if (headers && typeof headers === 'object') {
          for (const key of Object.keys(headers)) {
            if (/authorization|cookie|x-api-key|secret/i.test(key)) {
              delete (headers as Record<string, unknown>)[key]
            }
          }
        }
        return event
      },
    })

    // Correlate events with the current request id (when captured in a
    // request context). Non-blocking, best-effort.
    Sentry.getCurrentScope().addEventProcessor((event) => {
      const id = getRequestId()
      if (id) event.tags = { ...(event.tags ?? {}), request_id: id }
      return event
    })
  } catch {
    /* Sentry must never take the app down */
  }
}

/** True when Sentry was successfully initialized. */
export function isSentryEnabled(): boolean {
  return initialized
}
