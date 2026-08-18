import { env } from '../../../config/env.js'
import { getAppVersion } from '../../../utils/version.js'
import type { AlertLevel, NotificationEvent } from '../notification.types.js'

/**
 * Telegram message formatters.
 *
 * All messages use HTML parse mode. Every dynamic value is HTML-escaped so
 * provider error strings can never inject markup. Operational timestamps are
 * shown in Asia/Phnom_Penh (Cambodia time) as the spec requires.
 */

const LEVEL_ICON: Record<AlertLevel, string> = {
  info: 'ℹ️',
  warning: '⚠️',
  error: '🔴',
  critical: '🚨',
}

/** Escapes HTML metacharacters in untrusted/semi-trusted strings. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Formats a timestamp in the Cambodia timezone (Asia/Phnom_Penh). */
export function formatKhTime(date: Date | string = new Date()): string {
  const d = typeof date === 'string' ? new Date(date) : date
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Phnom_Penh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d)
  } catch {
    return d.toISOString().slice(0, 16).replace('T', ' ')
  }
}

/** Shared context block appended to most operational messages. */
function contextBlock(ev: Pick<NotificationEvent, 'environment' | 'version' | 'commit'>): string {
  const lines = [
    `Environment: ${escapeHtml(ev.environment ?? env.NODE_ENV)}`,
    `Version: ${escapeHtml(ev.version ?? getAppVersion().version)}`,
  ]
  const commit = ev.commit ?? getAppVersion().commit
  if (commit) lines.push(`Commit: <code>${escapeHtml(commit.slice(0, 12))}</code>`)
  return lines.join('\n')
}

/** Formats an operational alert (spike-aware). */
export function formatAlert(ev: NotificationEvent): string {
  const icon = LEVEL_ICON[ev.level]
  const lines = [
    `${icon} DigitalSMM ${ev.level.toUpperCase()}`,
    '',
    `Service: ${escapeHtml(ev.service)}`,
    `Event: ${escapeHtml(ev.event)}`,
    '',
    escapeHtml(ev.message),
  ]
  if (ev.details) lines.push('', escapeHtml(ev.details.slice(0, 500)))
  lines.push('', contextBlock(ev))
  if (ev.detectedAt) lines.push(`Detected: ${formatKhTime(ev.detectedAt)}`)
  if (ev.occurrences && ev.occurrences > 1) lines.push(`Occurrences: ${ev.occurrences}`)
  if (ev.status) lines.push(`Status: ${escapeHtml(ev.status)}`)
  return lines.join('\n')
}

/** Formats a deployment outcome (success/failure/rollback). */
export function formatDeployment(opts: {
  title: string
  icon: string
  service: string
  commit: string
  branch: string
  version: string
  duration?: string
  url?: string
  stage?: string
  reason?: string
}): string {
  const lines = [
    `${opts.icon} DigitalSMM ${opts.title}`,
    '',
    `Service: ${escapeHtml(opts.service)}`,
    `Commit: <code>${escapeHtml(opts.commit.slice(0, 12))}</code>`,
    `Branch: ${escapeHtml(opts.branch)}`,
    `Version: ${escapeHtml(opts.version)}`,
    `Time: ${formatKhTime()}`,
  ]
  if (opts.duration) lines.push(`Duration: ${escapeHtml(opts.duration)}`)
  if (opts.url) lines.push(`URL: ${escapeHtml(opts.url)}`)
  if (opts.stage) lines.push(`Stage: ${escapeHtml(opts.stage)}`)
  if (opts.reason) lines.push(`Reason: ${escapeHtml(opts.reason)}`)
  return lines.join('\n')
}

/** Formats a recovery message when an incident resolves. */
export function formatRecovery(opts: { service: string; title: string; durationSeconds: number }): string {
  const mins = Math.max(1, Math.round(opts.durationSeconds / 60))
  return [
    '🟢 DigitalSMM Recovery',
    '',
    `Service: ${escapeHtml(opts.service)}`,
    `Incident: ${escapeHtml(opts.title)}`,
    `Status: RESOLVED`,
    `Duration: ${mins}m`,
    `Time: ${formatKhTime()}`,
  ].join('\n')
}
