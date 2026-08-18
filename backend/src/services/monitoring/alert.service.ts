import { getAppVersion } from '../../utils/version.js'
import { logger } from '../../utils/logger.js'
import { telegram, type AlertLevel, type ErrorCategory } from '../../modules/notifications/index.js'
import { reportIncident, resolveIncidentByKey, type ReportIncidentInput } from './incident.service.js'
import { toIncidentSeverity } from '../../modules/notifications/notification.types.js'

/**
 * Centralized alert pipeline for operational failures:
 *
 *   Event → classify → severity → dedup (Telegram service) → incident →
 *   Telegram message
 *
 * Rules:
 * - NEVER throws: alerting is secondary to business logic (spec §118).
 * - Only meaningful failures alert — expected user mistakes (bad password,
 *   404s, validation errors) never reach Telegram.
 * - Repeated identical failures produce ONE aggregated spike alert thanks to
 *   the dedup in modules/notifications.
 * - Only safe identifiers are ever sent (no secrets, no customer data).
 */

export interface AlertEvent {
  /** Machine-readable category (see ERROR_CATEGORIES). */
  category: ErrorCategory
  level: AlertLevel
  service: string
  /** Machine-readable event name, e.g. 'webhook_invalid_signature'. */
  event: string
  /** Safe human-readable summary. */
  message: string
  details?: string
}

const categoryByEvent: Record<string, ErrorCategory> = {
  webhook_invalid_signature: 'WEBHOOK_ERROR',
  webhook_processing_failed: 'WEBHOOK_ERROR',
  payment_verification_failed: 'PAYMENT_ERROR',
  provider_order_submission_failed: 'SMM_PROVIDER_ERROR',
}

/**
 * Classifies an unknown error object into a category + safe summary.
 * Pure, testable.
 */
export function classifyError(err: unknown): { category: ErrorCategory; message: string } {
  const raw = err as { name?: string; message?: string; code?: string | number } | undefined
  const name = (raw?.name ?? '').toLowerCase()
  const message = (raw?.message ?? String(err ?? '')).toLowerCase()
  const code = String(raw?.code ?? '').toUpperCase()
  const fallbackMessage = typeof raw?.message === 'string' ? raw.message : String(err ?? 'Unexpected error')

  if (/mongo|mongoose|serverselection|mongoerror/i.test(name + message)) return { category: 'DATABASE_ERROR', message: safeMessage(fallbackMessage) }
  if (/redis/i.test(name + message)) return { category: 'REDIS_ERROR', message: safeMessage(fallbackMessage) }
  if (/zod|validation/i.test(name + message)) return { category: 'VALIDATION_ERROR', message: safeMessage(fallbackMessage) }
  if (/cutluy|payway|aba|payment|khqr/i.test(name + message)) return { category: 'PAYMENT_ERROR', message: safeMessage(fallbackMessage) }
  if (/webhook|signature|hmac/i.test(name + message)) return { category: 'WEBHOOK_ERROR', message: safeMessage(fallbackMessage) }
  if (/smmwiz|provider/i.test(name + message)) return { category: 'SMM_PROVIDER_ERROR', message: safeMessage(fallbackMessage) }
  if (/jwt|oauth|unauthorized|forbidden|token/i.test(name + message)) return { category: 'AUTH_ERROR', message: safeMessage(fallbackMessage) }
  if (/eai_again|econnrefused|enotfound|etimedout|econnreset|socket hang up|fetch failed|timeout/i.test(name + message + code)) {
    return { category: 'NETWORK_ERROR', message: safeMessage(fallbackMessage) }
  }
  return { category: 'INTERNAL_SERVER_ERROR', message: safeMessage(fallbackMessage) }
}

function safeMessage(msg: unknown): string {
  const s = typeof msg === 'string' ? msg : String(msg ?? 'Unexpected error')
  // Redact anything that looks like a URI with credentials or a secret.
  return s.replace(/mongodb(\+srv)?:\/\/[^\s@]+@/gi, 'mongodb$1://***@').slice(0, 300)
}

/**
 * Reports an operational alert: persists an incident and sends a Telegram
 * message (deduplicated). Never throws.
 */
export async function reportAlert(input: AlertEvent): Promise<void> {
  try {
    const app = getAppVersion()
    const key = `${input.service}:${input.event}`

    // Persist incident (upsert by key while open).
    const incidentInput: ReportIncidentInput = {
      key,
      severity: toIncidentSeverity(input.level),
      service: input.service,
      title: input.message,
      message: input.details ?? '',
      environment: app.environment,
      version: app.version,
    }
    await reportIncident(incidentInput)

    // Send Telegram (internal dedup + level gate). Fire-and-forget.
    void telegram.notify({
      level: input.level,
      service: input.service,
      event: input.event,
      message: input.message,
      details: input.details,
      environment: app.environment,
      version: app.version,
      commit: app.commit,
    })
  } catch (err) {
    logger.warn('[alert] failed to report alert', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/** Reports an unexpected 5xx from the error middleware. */
export function reportUnhandledError(err: unknown): void {
  const { category, message } = classifyError(err)
  // Provider/webhook/payment failures have dedicated call sites — don't
  // double-alert for them here.
  if (
    category === 'SMM_PROVIDER_ERROR' ||
    category === 'PAYMENT_ERROR' ||
    category === 'WEBHOOK_ERROR'
  ) {
    return
  }
  void reportAlert({
    category,
    level: category === 'DATABASE_ERROR' || category === 'NETWORK_ERROR' ? 'critical' : 'error',
    service: 'backend',
    event: `unhandled_${category.toLowerCase()}`,
    message,
  })
}

/** Resolves every open incident for a service:event key (recovery path). */
export function resolveAlert(key: string, reason: string): void {
  void resolveIncidentByKey(key, reason)
}

/** Exposed for tests — category lookup for explicit events. */
export function categoryForEvent(event: string): ErrorCategory {
  return categoryByEvent[event] ?? 'INTERNAL_SERVER_ERROR'
}
