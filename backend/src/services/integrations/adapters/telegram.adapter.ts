import type { AdapterTestResult, DecryptedCredentials } from '../integration.types.js'
import { classifyProviderError, fromHttpStatus } from './errors.js'

/**
 * Telegram Bot API adapter — real integration with api.telegram.org.
 *
 * Used by the Admin Integrations connection test (getMe + getChat) and the
 * "Send Test Message" action (sendMessage). Runtime publishing (sendPhoto,
 * sendDocument, publishPost) will build on `telegramRequest` below.
 *
 * Secrets never leave this module's inputs — callers decrypt internally and
 * pass plaintext only in memory. Results returned to the UI contain no
 * tokens.
 */

const API_BASE = 'https://api.telegram.org'
const REQUEST_TIMEOUT_MS = 8_000

interface TelegramApiResponse {
  ok: boolean
  result?: {
    username?: string
    type?: string
    first_name?: string
    id?: number
    message_id?: number
  }
  error_code?: number
  description?: string
}

/** Thin fetch wrapper with timeout; throws normalized errors. */
async function telegramRequest(token: string, method: string, body?: Record<string, unknown>): Promise<{ status: number; data: TelegramApiResponse }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(`${API_BASE}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
    const data = (await res.json().catch(() => ({}))) as TelegramApiResponse
    return { status: res.status, data }
  } catch (err) {
    throw classifyProviderError(err)
  } finally {
    clearTimeout(timer)
  }
}

/** Validates the bot token (getMe). Throws a normalized ProviderErrorInfo. */
export async function validateTelegramBot(token: string): Promise<{ username: string }> {
  const { status, data } = await telegramRequest(token, 'getMe')
  if (data.ok && data.result?.username) {
    return { username: data.result.username }
  }
  if (status === 401 || (data.description ?? '').toLowerCase().includes('unauthorized')) {
    throw { code: 'INVALID_CREDENTIALS', message: 'The bot token was rejected by Telegram.' }
  }
  if (status === 429) throw { code: 'RATE_LIMITED', message: 'Telegram rate-limited the request. Try again later.' }
  throw fromHttpStatus(status)
}

/** Validates the destination chat/group/channel (getChat). */
export async function validateTelegramDestination(
  token: string,
  chatId: string,
): Promise<{ type: string; available: boolean }> {
  const { status, data } = await telegramRequest(token, 'getChat', { chat_id: chatId })
  if (data.ok && data.result?.type) {
    return { type: data.result.type, available: true }
  }
  if (status === 400 || /chat not found|wrong chat|not found/i.test(data.description ?? '')) {
    throw { code: 'INVALID_DESTINATION', message: 'The destination chat was not found. Check the Chat ID.' }
  }
  if (status === 403) throw { code: 'FORBIDDEN', message: 'The bot has no access to this destination. Add the bot and grant permissions.' }
  throw fromHttpStatus(status)
}

/** Sends a message. Returns Telegram's message id. */
export async function sendTelegramMessage(
  token: string,
  chatId: string,
  text: string,
): Promise<{ messageId: number }> {
  const { status, data } = await telegramRequest(token, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  })
  if (data.ok && data.result?.message_id !== undefined) {
    return { messageId: data.result.message_id }
  }
  if (status === 400 || /chat not found|wrong chat/i.test(data.description ?? '')) {
    throw { code: 'INVALID_DESTINATION', message: 'The destination chat was not found. Check the Chat ID.' }
  }
  if (status === 401 || (data.description ?? '').toLowerCase().includes('unauthorized')) {
    throw { code: 'INVALID_CREDENTIALS', message: 'The bot token was rejected by Telegram.' }
  }
  throw fromHttpStatus(status)
}

/**
 * Full connection test: validate bot, then destination. Returns only safe
 * details (bot username + destination type).
 */
export async function testTelegramConnection(creds: DecryptedCredentials): Promise<AdapterTestResult> {
  if (!creds.botToken) {
    return { success: false, errorCode: 'NOT_CONFIGURED', message: 'A bot token is required.' }
  }
  if (!creds.chatId) {
    return { success: false, errorCode: 'NOT_CONFIGURED', message: 'A destination chat ID is required.' }
  }
  try {
    const bot = await validateTelegramBot(creds.botToken)
    const destination = await validateTelegramDestination(creds.botToken, creds.chatId)
    return {
      success: true,
      status: 'CONNECTED',
      details: {
        bot: { username: `@${bot.username}` },
        destination: { type: destination.type, available: destination.available },
      },
      message: 'Connection successful.',
    }
  } catch (err) {
    const info = err as { code?: string; message?: string }
    return {
      success: false,
      errorCode: (info.code as AdapterTestResult['errorCode']) ?? 'UNKNOWN_ERROR',
      message: info.message ?? 'Connection failed.',
    }
  }
}
