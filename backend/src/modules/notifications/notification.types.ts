/**
 * Notification domain types.
 *
 * The Telegram service is the single notification adapter today; the
 * `NotificationEvent` shape is the contract application code emits, so a
 * future adapter (Slack, email, …) can be added without touching callers.
 */

export const ALERT_LEVELS = ['info', 'warning', 'error', 'critical'] as const
export type AlertLevel = (typeof ALERT_LEVELS)[number]

/** Normalized alert priority used by the incident system. */
export const INCIDENT_SEVERITIES = ['warning', 'error', 'critical'] as const
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number]

export const INCIDENT_STATUSES = ['open', 'investigating', 'resolved'] as const
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number]

/** Error categories detected by the alert classifier. */
export const ERROR_CATEGORIES = [
  'DATABASE_ERROR',
  'REDIS_ERROR',
  'AUTH_ERROR',
  'PAYMENT_ERROR',
  'WEBHOOK_ERROR',
  'SMM_PROVIDER_ERROR',
  'API_ERROR',
  'VALIDATION_ERROR',
  'NETWORK_ERROR',
  'INTERNAL_SERVER_ERROR',
  'DEPLOYMENT_ERROR',
  'HEALTH_CHECK_ERROR',
] as const
export type ErrorCategory = (typeof ERROR_CATEGORIES)[number]

export interface NotificationEvent {
  level: AlertLevel
  service: string
  /** Machine-readable event name, e.g. 'payment_verification_failed'. */
  event: string
  /** Short human-readable summary (safe, no secrets). */
  message: string
  environment?: string
  version?: string
  commit?: string
  /** Optional free-form detail line(s). Never include secrets or customer data. */
  details?: string
  detectedAt?: string
  status?: string
  /** Total occurrences for aggregated (spike) alerts — set by the service. */
  occurrences?: number
}

/** Internal identity used for deduplication. */
export function eventKey(ev: NotificationEvent): string {
  return `${ev.service}:${ev.event}`
}

/** Severity ordering: higher = more severe. */
export const LEVEL_RANK: Record<AlertLevel, number> = {
  info: 0,
  warning: 1,
  error: 2,
  critical: 3,
}

export function isAtLeast(level: AlertLevel, minimum: AlertLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[minimum]
}

export function toIncidentSeverity(level: AlertLevel): IncidentSeverity {
  if (level === 'critical') return 'critical'
  if (level === 'error') return 'error'
  return 'warning'
}
