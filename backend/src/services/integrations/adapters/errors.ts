import type { IntegrationErrorCode } from '../integration.types.js'

/**
 * Normalizes an unknown provider error into a safe IntegrationErrorCode.
 * Raw provider messages may contain secrets (e.g. "invalid key abc123") —
 * the code + a generic message go to the UI, never the raw error text.
 */

export interface ProviderErrorInfo {
  code: IntegrationErrorCode
  message: string
}

const GENERIC: Record<IntegrationErrorCode, string> = {
  INVALID_CREDENTIALS: 'The configured credentials were rejected.',
  UNAUTHORIZED: 'The provider rejected the credentials (unauthorized).',
  FORBIDDEN: 'The provider refused the request (forbidden).',
  RATE_LIMITED: 'The provider rate-limited the request. Try again later.',
  TIMEOUT: 'The provider did not respond in time.',
  NETWORK_ERROR: 'Could not reach the provider (network error).',
  INVALID_DESTINATION: 'The configured destination was not found or is invalid.',
  PROVIDER_UNAVAILABLE: 'The provider is unavailable right now.',
  NOT_CONFIGURED: 'This integration is not configured yet.',
  UNSUPPORTED: 'This integration does not support connection testing yet.',
  UNKNOWN_ERROR: 'The provider returned an unexpected error.',
}

/** Classify by HTTP status where available. */
export function fromHttpStatus(status: number | undefined, fallback: IntegrationErrorCode = 'UNKNOWN_ERROR'): ProviderErrorInfo {
  if (status === 401) return { code: 'UNAUTHORIZED', message: GENERIC.UNAUTHORIZED }
  if (status === 403) return { code: 'FORBIDDEN', message: GENERIC.FORBIDDEN }
  if (status === 429) return { code: 'RATE_LIMITED', message: GENERIC.RATE_LIMITED }
  if (status === 408 || status === 504) return { code: 'TIMEOUT', message: GENERIC.TIMEOUT }
  if (status !== undefined && status >= 500) {
    return { code: 'PROVIDER_UNAVAILABLE', message: GENERIC.PROVIDER_UNAVAILABLE }
  }
  return { code: fallback, message: GENERIC[fallback] }
}

/** Classify an arbitrary thrown error (AbortError → timeout, fetch failure → network, ...). */
export function classifyProviderError(err: unknown): ProviderErrorInfo {
  const raw = err as { name?: string; message?: string; code?: string | number; status?: number } | undefined
  const name = String(raw?.name ?? '')
  const message = String(raw?.message ?? err ?? '')

  if (name === 'AbortError' || /timed? ?out|abort/i.test(message)) {
    return { code: 'TIMEOUT', message: GENERIC.TIMEOUT }
  }
  if (typeof raw?.status === 'number' && raw.status > 0) {
    return fromHttpStatus(raw.status)
  }
  if (name === 'TypeError' || /fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|socket/i.test(message)) {
    return { code: 'NETWORK_ERROR', message: GENERIC.NETWORK_ERROR }
  }
  if (/unauthorized|invalid api key|incorrect api key|bad api key|authentication failed|401/i.test(message)) {
    return { code: 'INVALID_CREDENTIALS', message: GENERIC.INVALID_CREDENTIALS }
  }
  if (/rate|too many requests|429/i.test(message)) {
    return { code: 'RATE_LIMITED', message: GENERIC.RATE_LIMITED }
  }
  if (/chat not found|wrong chat|invalid chat|destination/i.test(message)) {
    return { code: 'INVALID_DESTINATION', message: GENERIC.INVALID_DESTINATION }
  }
  return { code: 'UNKNOWN_ERROR', message: GENERIC.UNKNOWN_ERROR }
}

/** Public generic messages for the UI. */
export const GENERIC_MESSAGES = GENERIC
