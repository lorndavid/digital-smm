import { env } from '../../../config/env.js'
import { logger } from '../../../utils/logger.js'

/**
 * Minimal Telegram Bot API client (sendMessage only).
 *
 * FAIL-SAFE: the bot is optional infrastructure. If it is not configured,
 * the network fails, or Telegram returns an error, this NEVER throws and
 * NEVER blocks business logic — it logs and returns false.
 */

const SEND_TIMEOUT_MS = 8_000
const MAX_MESSAGE_LENGTH = 4000

export function isTelegramConfigured(): boolean {
  return Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID)
}

/**
 * Sends a plain-text (already formatted) message. Returns true on success.
 * Never throws.
 */
export async function sendTelegramMessage(text: string): Promise<boolean> {
  if (!isTelegramConfigured()) return false

  const body = JSON.stringify({
    chat_id: env.TELEGRAM_CHAT_ID,
    text: text.slice(0, MAX_MESSAGE_LENGTH),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  })

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS)
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (!res.ok) {
      logger.warn('[telegram] sendMessage rejected', { status: res.status })
      return false
    }
    return true
  } catch (err) {
    logger.warn('[telegram] sendMessage failed', {
      error: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}
