import type {
  AdapterTestResult,
  DecryptedCredentials,
  DecryptedDestination,
  DestinationType,
} from '../integration.types.js'
import { classifyProviderError, fromHttpStatus } from './errors.js'

/**
 * Telegram Bot API adapter — real integration with api.telegram.org.
 *
 * Supports MULTIPLE destinations: personal chats (positive ids), groups,
 * supergroups and channels (-100…) can all be listed on one integration.
 *
 * PRIVATE-CHAT RULE: Telegram only lets a bot verify/send to a private chat
 * after that user has messaged the bot (pressed Start). `getChat` returns
 * 400 "chat not found" until then, so for private destinations we fall back
 * to scanning `getUpdates` — after the user presses Start their chat id
 * appears there and the destination validates.
 *
 * Secrets never leave this module's inputs — callers decrypt internally and
 * pass plaintext only in memory. Results returned to the UI contain no
 * tokens.
 */

const API_BASE = 'https://api.telegram.org'
const REQUEST_TIMEOUT_MS = 8_000

interface TelegramApiResponse {
  ok: boolean
  result?: unknown
  error_code?: number
  description?: string
}

/** Thin fetch wrapper with timeout; throws normalized errors. */
async function telegramRequest(
  token: string,
  method: string,
  body?: Record<string, unknown>,
): Promise<{ status: number; data: TelegramApiResponse }> {
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

function isAuthFailure(status: number, description?: string): boolean {
  return status === 401 || (description ?? '').toLowerCase().includes('unauthorized')
}

function isChatNotFound(status: number, description?: string): boolean {
  return status === 400 && /chat not found|wrong chat|not found|too many requests/i.test(description ?? '')
}

/** Validates the bot token (getMe). Throws a normalized ProviderErrorInfo. */
export async function validateTelegramBot(token: string): Promise<{ username: string }> {
  const { status, data } = await telegramRequest(token, 'getMe')
  const result = (data.result ?? {}) as { username?: string }
  if (data.ok && result.username) {
    return { username: result.username }
  }
  if (isAuthFailure(status, data.description)) {
    throw { code: 'INVALID_CREDENTIALS', message: 'The bot token was rejected by Telegram.' }
  }
  if (status === 429) throw { code: 'RATE_LIMITED', message: 'Telegram rate-limited the request. Try again later.' }
  throw fromHttpStatus(status)
}

/** Scans getUpdates for a chat id (private chats after the user pressed Start). */
async function findChatIdInUpdates(token: string, chatId: string): Promise<boolean> {
  const { data } = await telegramRequest(token, 'getUpdates', { limit: 100, timeout: 0 })
  if (!data.ok) return false
  const updates = Array.isArray(data.result) ? (data.result as Array<Record<string, unknown>>) : []
  for (const update of updates) {
    const message = (update.message ?? update.channel_post ?? {}) as Record<string, unknown>
    const chat = message.chat as Record<string, unknown> | undefined
    if (chat && String(chat.id) === String(chatId)) return true
    const myMember = update.my_chat_member as Record<string, unknown> | undefined
    const memberChat = myMember?.chat as Record<string, unknown> | undefined
    if (memberChat && String(memberChat.id) === String(chatId)) return true
    const callback = update.callback_query as Record<string, unknown> | undefined
    const callbackChat = (callback?.message as Record<string, unknown> | undefined)?.chat as
      | Record<string, unknown>
      | undefined
    if (callbackChat && String(callbackChat.id) === String(chatId)) return true
  }
  return false
}

/** Validates one destination. Returns safe info. Throws a normalized error. */
export async function validateTelegramDestination(
  token: string,
  chatId: string,
  type?: DestinationType,
): Promise<{ type: string; available: boolean }> {
  const { status, data } = await telegramRequest(token, 'getChat', { chat_id: chatId })
  const result = (data.result ?? {}) as { type?: string }
  if (data.ok && result.type) {
    return { type: result.type, available: true }
  }
  // Private chats: the bot can only see the chat after the user pressed
  // Start. Fall back to getUpdates before declaring the destination invalid.
  if (isChatNotFound(status, data.description) && (type === 'private' || /^\d+$/.test(chatId))) {
    if (await findChatIdInUpdates(token, chatId)) {
      return { type: 'private', available: true }
    }
    throw {
      code: 'INVALID_DESTINATION',
      message:
        'This private chat is not reachable yet — the recipient must open the bot and press Start (send any message) once, then test again.',
    }
  }
  if (status === 403) {
    throw {
      code: 'FORBIDDEN',
      message: 'The bot has no access to this destination. Add the bot and grant the needed permissions.',
    }
  }
  if (isChatNotFound(status, data.description) || status === 400) {
    throw {
      code: 'INVALID_DESTINATION',
      message: 'The destination chat was not found. Check the Chat ID (positive = personal, -100… = supergroup/channel, @username = public).',
    }
  }
  if (isAuthFailure(status, data.description)) {
    throw { code: 'INVALID_CREDENTIALS', message: 'The bot token was rejected by Telegram.' }
  }
  if (status === 429) throw { code: 'RATE_LIMITED', message: 'Telegram rate-limited the request. Try again later.' }
  throw fromHttpStatus(status)
}

/** Validates every destination; returns per-destination safe results. */
export async function validateTelegramDestinations(
  token: string,
  destinations: DecryptedDestination[],
): Promise<Array<{ type: string; chatId: string; ok: boolean; errorCode?: string; message?: string }>> {
  const results: Array<{ type: string; chatId: string; ok: boolean; errorCode?: string; message?: string }> = []
  for (const dest of destinations) {
    try {
      const info = await validateTelegramDestination(token, dest.chatId, dest.type)
      results.push({ type: info.type, chatId: maskChatId(dest.chatId), ok: true })
    } catch (err) {
      const info = err as { code?: string; message?: string }
      results.push({
        type: dest.type,
        chatId: maskChatId(dest.chatId),
        ok: false,
        errorCode: info.code ?? 'UNKNOWN_ERROR',
        message: info.message,
      })
    }
  }
  return results
}

/** Sends a message to ONE chat. Returns Telegram's message id. */
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
  const result = (data.result ?? {}) as { message_id?: number }
  if (data.ok && result.message_id !== undefined) {
    return { messageId: result.message_id }
  }
  if (isChatNotFound(status, data.description) || status === 400) {
    throw { code: 'INVALID_DESTINATION', message: 'The destination chat was not found. Check the Chat ID.' }
  }
  if (isAuthFailure(status, data.description)) {
    throw { code: 'INVALID_CREDENTIALS', message: 'The bot token was rejected by Telegram.' }
  }
  if (status === 429) throw { code: 'RATE_LIMITED', message: 'Telegram rate-limited the request. Try again later.' }
  throw fromHttpStatus(status)
}

/** Sends a message to EVERY destination; returns per-destination results. */
export async function sendTelegramMessageToAll(
  token: string,
  destinations: DecryptedDestination[],
  text: string,
): Promise<Array<{ chatId: string; ok: boolean; messageId?: number; errorCode?: string }>> {
  const results: Array<{ chatId: string; ok: boolean; messageId?: number; errorCode?: string }> = []
  for (const dest of destinations) {
    try {
      const { messageId } = await sendTelegramMessage(token, dest.chatId, text)
      results.push({ chatId: maskChatId(dest.chatId), ok: true, messageId })
    } catch (err) {
      const info = err as { code?: string }
      results.push({ chatId: maskChatId(dest.chatId), ok: false, errorCode: info.code ?? 'UNKNOWN_ERROR' })
    }
  }
  return results
}

/**
 * Full connection test: validate the bot, then EVERY destination. Returns
 * only safe details (bot username + per-destination masked results).
 */
export async function testTelegramConnection(
  creds: DecryptedCredentials,
  destinations: DecryptedDestination[],
): Promise<AdapterTestResult> {
  if (!creds.botToken) {
    return { success: false, errorCode: 'NOT_CONFIGURED', message: 'A bot token is required.' }
  }
  if (!destinations.length) {
    return {
      success: false,
      errorCode: 'NOT_CONFIGURED',
      message: 'Add at least one destination (personal chat, group, supergroup or channel).',
    }
  }
  try {
    const bot = await validateTelegramBot(creds.botToken)
    const destinationResults = await validateTelegramDestinations(creds.botToken, destinations)
    const allOk = destinationResults.every((d) => d.ok)
    return {
      success: allOk,
      status: allOk ? 'CONNECTED' : 'CONNECTION_FAILED',
      details: {
        bot: { username: `@${bot.username}` },
        destinations: destinationResults.map((d) => ({
          type: d.type,
          chatId: d.chatId,
          ok: d.ok,
          ...(d.errorCode ? { errorCode: d.errorCode } : {}),
          ...(d.message ? { message: d.message } : {}),
        })),
      },
      message: allOk
        ? `Connection successful — ${destinationResults.length} destination${destinationResults.length === 1 ? '' : 's'} verified.`
        : 'One or more destinations could not be verified.',
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

/** Masks a chat id for safe display (bullets + last 4). */
export function maskChatId(chatId: string): string {
  return '•'.repeat(12) + chatId.slice(-4)
}
