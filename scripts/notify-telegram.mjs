#!/usr/bin/env node
/**
 * Telegram notification helper for CI/CD pipelines.
 *
 * Usage:  node scripts/notify-telegram.mjs "message text"
 * Env:    TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID  (GitHub Actions secrets)
 *
 * Fail-safe: never exits non-zero because Telegram is down — deployment
 * pipelines must never fail because a notification could not be delivered.
 */
const message = process.argv[2]
if (!message) {
  console.error('usage: node scripts/notify-telegram.mjs "message"')
  process.exit(1)
}

const token = process.env.TELEGRAM_BOT_TOKEN
const chatId = process.env.TELEGRAM_CHAT_ID

if (!token || !chatId) {
  console.warn('[notify-telegram] TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID not set — skipping')
  process.exit(0)
}

const safe = message.slice(0, 4000)

try {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: safe,
      disable_web_page_preview: true,
    }),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) {
    console.warn(`[notify-telegram] Telegram returned ${res.status} — skipping`)
    process.exit(0)
  }
  console.log('[notify-telegram] sent')
} catch (err) {
  console.warn('[notify-telegram] failed:', err instanceof Error ? err.message : err)
  process.exit(0)
}
