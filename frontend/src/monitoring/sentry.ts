import * as Sentry from '@sentry/vue'
import type { App } from 'vue'
import type { Router } from 'vue-router'
import { analyticsConfig } from '@/analytics/config'

/**
 * Sentry frontend initialization.
 *
 * VITE_SENTRY_DSN is a PUBLIC value — the browser must know where to send
 * events. Only enabled when a DSN is configured (never in dev), so local
 * development stays free of Sentry noise.
 */

let initialized = false

/** Initializes Sentry with the Vue + router integrations. Idempotent. */
export function initializeSentry(app?: App<Element>, router?: Router): void {
  if (initialized) return
  const dsn = (import.meta.env.VITE_SENTRY_DSN ?? '').trim()
  if (!dsn || import.meta.env.DEV) return

  initialized = true

  try {
    Sentry.init({
      app,
      ...(router ? { router } : {}),
      dsn,
      environment: analyticsConfig.environment,
      release: `digitalsmm-frontend@${import.meta.env.VITE_APP_ENV ?? 'dev'}`,
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      // Never send personal data in breadcrumbs.
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
