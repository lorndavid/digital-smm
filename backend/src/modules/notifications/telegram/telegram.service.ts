import { env } from '../../../config/env.js'
import { logger } from '../../../utils/logger.js'
import {
  eventKey,
  isAtLeast,
  type AlertLevel,
  type NotificationEvent,
} from '../notification.types.js'
import { sendTelegramMessage } from './telegram.client.js'
import { formatAlert, formatDeployment, formatRecovery } from './telegram.formatter.js'

/**
 * Centralized Telegram notification service.
 *
 * - FAIL-SAFE: never throws, never blocks callers (fire-and-forget).
 * - LEVEL GATE: only levels >= minLevel are sent.
 * - DEDUPLICATION: the first occurrence of `service:event` is sent
 *   immediately; repeats within the cooldown window are counted and
 *   suppressed, and the next message (after the cooldown) reports the total
 *   occurrences — one aggregated spike alert, never a flood.
 * - NEVER logs or forwards secrets: callers are responsible for sending
 *   safe identifiers only (documented in every alert call site).
 */

export interface TelegramServiceConfig {
  botToken?: string
  chatId?: string
  enabled: boolean
  minLevel: AlertLevel
  cooldownMs: number
}

interface DedupState {
  firstSeenAt: number
  lastSentAt: number
  suppressed: number
  /** Total occurrences seen so far in the current window (incl. sent). */
  count: number
}

export class TelegramService {
  private readonly dedup = new Map<string, DedupState>()

  constructor(private readonly config: TelegramServiceConfig) {}

  private configured(): boolean {
    return Boolean(this.config.botToken && this.config.chatId && this.config.enabled)
  }

  /**
   * Emits a notification event. Returns true when a message was actually
   * sent (useful for tests); never throws.
   */
  async notify(ev: NotificationEvent): Promise<boolean> {
    if (!this.configured()) return false
    if (!isAtLeast(ev.level, this.config.minLevel)) return false

    const key = eventKey(ev)
    const now = Date.now()
    const state = this.dedup.get(key)

    // First occurrence (or cooldown elapsed): send, then remember.
    if (!state || now - state.lastSentAt >= this.config.cooldownMs) {
      // Total occurrences = everything seen in the previous window + this one.
      const occurrences = (state?.count ?? 0) + 1
      this.dedup.set(key, {
        firstSeenAt: state?.firstSeenAt ?? now,
        lastSentAt: now,
        suppressed: 0,
        count: 1,
      })
      const withOccurrences: NotificationEvent = {
        ...ev,
        occurrences,
        detectedAt: ev.detectedAt ?? new Date().toISOString(),
      }
      return this.send(formatAlert(withOccurrences))
    }

    // Within cooldown: count, do not send.
    state.suppressed += 1
    state.count += 1
    if (state.suppressed === 1 || state.suppressed % 100 === 0) {
      logger.debug('[telegram] suppressed duplicate alert', {
        key,
        suppressed: state.suppressed,
      })
    }
    return false
  }

  /** Sends a deployment success message (no dedup — deployment events are one-shot). */
  deploymentSuccess(opts: {
    service: string
    commit: string
    branch: string
    version: string
    duration?: string
    url?: string
  }): Promise<boolean> {
    return this.sendRaw(
      formatDeployment({
        title: 'Deployment',
        icon: '🟢',
        ...opts,
      }),
    )
  }

  /** Sends a deployment failure message (may be followed by rollback). */
  deploymentFailed(opts: {
    service: string
    commit: string
    branch: string
    version: string
    stage: string
    reason?: string
  }): Promise<boolean> {
    return this.sendRaw(
      formatDeployment({
        title: 'Deployment Failed',
        icon: '🔴',
        ...opts,
      }),
    )
  }

  /** Sends a rollback message. */
  rollback(opts: {
    service: string
    newVersion: string
    previousVersion: string
    reason: string
    success: boolean
  }): Promise<boolean> {
    return this.sendRaw(
      [
        `${opts.success ? '🟠' : '🚨'} DigitalSMM Automatic Rollback`,
        '',
        `Service: ${opts.service}`,
        `New version: ${opts.newVersion}`,
        `Previous version: ${opts.previousVersion}`,
        `Reason: ${opts.reason}`,
        `Rollback status: ${opts.success ? 'SUCCESS' : 'FAILED'}`,
        `Time: ${formatTime()}`,
      ].join('\n'),
    )
  }

  /** Sends a recovery message (incident resolved). */
  recovery(opts: { service: string; title: string; durationSeconds: number }): Promise<boolean> {
    return this.sendRaw(formatRecovery(opts))
  }

  /** Sends an already-formatted multi-line report (daily report etc.). */
  async sendReport(lines: string[]): Promise<boolean> {
    if (!this.configured()) return false
    return this.sendRaw(lines.join('\n'))
  }

  /** Sends an arbitrary formatted message without dedup (reports, deployments). */
  private async sendRaw(text: string): Promise<boolean> {
    if (!this.configured()) return false
    return this.send(text)
  }

  private async send(text: string): Promise<boolean> {
    try {
      return await sendTelegramMessage(text)
    } catch {
      return false
    }
  }
}

function formatTime(): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Phnom_Penh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date())
}

/** Default instance wired to the environment. */
export const telegram = new TelegramService({
  botToken: env.TELEGRAM_BOT_TOKEN ?? undefined,
  chatId: env.TELEGRAM_CHAT_ID ?? undefined,
  enabled: env.TELEGRAM_ALERTS_ENABLED,
  minLevel: env.TELEGRAM_MIN_ALERT_LEVEL,
  cooldownMs: env.TELEGRAM_ALERT_COOLDOWN_MS,
})
