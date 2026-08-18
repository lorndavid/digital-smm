/**
 * Notifications module — the single place operational notifications are
 * produced. Application code emits typed NotificationEvents; the Telegram
 * service handles level gating, deduplication and delivery.
 */
export { telegram } from './telegram/telegram.service.js'
export { isTelegramConfigured } from './telegram/telegram.client.js'
export { formatKhTime } from './telegram/telegram.formatter.js'
export {
  ALERT_LEVELS,
  ERROR_CATEGORIES,
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
  eventKey,
  isAtLeast,
  toIncidentSeverity,
  type AlertLevel,
  type ErrorCategory,
  type IncidentSeverity,
  type IncidentStatus,
  type NotificationEvent,
} from './notification.types.js'
