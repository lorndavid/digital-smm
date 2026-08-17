import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'

/**
 * Request context — correlates every log line, error and metric emitted
 * during one HTTP request with the same `requestId`.
 *
 * Usage (see middleware/request-context.middleware.ts):
 *
 *   requestContext.run(() => handler(req, res))   // inside: getRequestId()
 *
 * The id is propagated to Sentry, structured logs and the request metrics,
 * so a single request is traceable across backend logs, error monitoring
 * and business operations.
 */

interface RequestStore {
  requestId: string
  /** Inferred route template, e.g. '/api/orders/:id'. */
  route?: string
}

const store = new AsyncLocalStorage<RequestStore>()

/** Generates a fresh correlation id (cryptographic random). */
export function generateRequestId(): string {
  return randomUUID()
}

/** Runs a handler inside a request context. */
export function runWithRequestContext<T>(fn: () => T, requestId = generateRequestId()): T {
  return store.run({ requestId }, fn)
}

/** Returns the current requestId, or null outside a request. */
export function getRequestId(): string | null {
  return store.getStore()?.requestId ?? null
}

/** Sets the inferred route template for the current request. */
export function setRequestRoute(route: string): void {
  const current = store.getStore()
  if (current) current.route = route
}

/** Returns the inferred route template for the current request. */
export function getRequestRoute(): string | undefined {
  return store.getStore()?.route
}
