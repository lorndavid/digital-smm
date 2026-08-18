import * as Sentry from '@sentry/vue'
import type { App } from 'vue'
import type { Router } from 'vue-router'

/**
 * Sentry admin-panel initialization.
 *
 * The DSN is a PUBLIC value — the browser must know where to send events, so
 * it ships in the bundle by design. The default below is the project DSN;
 * VITE_SENTRY_DSN can override it per environment when needed.
 *
 * Disabled in dev so local development stays free of Sentry noise.
 */

/** Default Sentry DSN — public by design (embedded in the client bundle). */
export const DEFAULT_SENTRY_DSN =
  'https://7ecd64e4a52e3f77d0c7a93814c304d8@o4511930120601600.ingest.us.sentry.io/4511930127286272'

function detectEnvironment(): string {
  const raw = (import.meta.env.VITE_APP_ENV ?? '').trim().toLowerCase()
  if (raw === 'staging' || raw === 'production') return raw
  // In production builds without an explicit tag, be conservative and tag
  // as production so events are never mislabelled as development.
  if (import.meta.env.PROD) return 'production'
  return 'development'
}

let initialized = false

/** Initializes Sentry with the Vue + router integrations. Idempotent. */
export function initializeSentry(app?: App<Element>, router?: Router): void {
  if (initialized) return
  const dsn = (import.meta.env.VITE_SENTRY_DSN ?? '').trim() || DEFAULT_SENTRY_DSN
  if (!dsn || import.meta.env.DEV) return

  initialized = true

  try {
    Sentry.init({
      app,
      dsn,
      environment: detectEnvironment(),
      release: `digitalsmm-admin@${import.meta.env.VITE_APP_ENV ?? 'dev'}`,
      integrations: [
        // Distributed tracing: captures page-load navigations and SPA route
        // changes as transactions (requires the router instance).
        Sentry.browserTracingIntegration({ router }),
        // Session Replay: watchable video of real admin sessions.
        Sentry.replayIntegration(),
      ],
      // Tracing — capture 100% of transactions in production.
      tracesSampleRate: 1.0,
      // Only attach outgoing trace headers to localhost (dev) and the API
      // origin, so the backend can join traces without leaking them elsewhere.
      tracePropagationTargets: ['localhost', /^https:\/\/api\.digitalsmm\.shop/],
      // Session Replay — sample 10% of all sessions, but 100% of sessions
      // that hit an error so problems always have a replay attached.
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
      // Logs
      enableLogs: true,
      // Never send personal data in breadcrumbs/events.
      beforeSend(event) {
        if (event.request?.url) {
          // Keep the path, drop query strings that may contain tokens/links.
          try {
            const url = new URL(event.request.url)
            event.request.url = url.origin + url.pathname
          } catch {
            /* keep as-is */
          }
        }
        return event
      },
    })
  } catch {
    /* Sentry must never break the app */
  }
}

/** True when Sentry was successfully initialized. */
export function isSentryEnabled(): boolean {
  return initialized
}
