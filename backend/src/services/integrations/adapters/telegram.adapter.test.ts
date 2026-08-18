import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    CREDENTIAL_ENCRYPTION_KEY: 'a'.repeat(64),
    INTEGRATION_HEALTH_INTERVAL_MS: 1_800_000,
    ENABLE_INTEGRATION_HEALTH_JOB: true,
  },
  corsOrigins: [],
}))

import {
  sendTelegramMessage,
  testTelegramConnection,
  validateTelegramBot,
  validateTelegramDestination,
} from './telegram.adapter.js'

const TOKEN = '123456789:ABCdefGHIjkLMNOPqrsTUVwxyz0123456789ab'
const CHAT = '-1001234567890'

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('telegram adapter', () => {
  it('validates the bot (getMe) and destination (getChat) on test', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, { ok: true, result: { username: 'digitalsmm_bot' } }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, { ok: true, result: { type: 'supergroup' } }),
      )
    vi.stubGlobal('fetch', fetchMock)

    const result = await testTelegramConnection({ botToken: TOKEN, chatId: CHAT })

    expect(result.success).toBe(true)
    expect(result.status).toBe('CONNECTED')
    expect(result.details).toEqual({
      bot: { username: '@digitalsmm_bot' },
      destination: { type: 'supergroup', available: true },
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    // No secrets in any URL or payload.
    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).toContain('bot')
      expect(JSON.stringify(call)).not.toContain('token')
    }
  })

  it('maps a 401 from getMe to INVALID_CREDENTIALS', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(401, { ok: false, error_code: 401, description: 'Unauthorized' }),
      ),
    )
    const result = await testTelegramConnection({ botToken: TOKEN, chatId: CHAT })
    expect(result.success).toBe(false)
    expect(result.errorCode).toBe('INVALID_CREDENTIALS')
  })

  it('maps an unknown chat to INVALID_DESTINATION', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(200, { ok: true, result: { username: 'bot' } }))
        .mockResolvedValueOnce(
          jsonResponse(400, { ok: false, error_code: 400, description: 'Bad Request: chat not found' }),
        ),
    )
    const result = await testTelegramConnection({ botToken: TOKEN, chatId: '999999' })
    expect(result.success).toBe(false)
    expect(result.errorCode).toBe('INVALID_DESTINATION')
  })

  it('maps a fetch abort to TIMEOUT', async () => {
    const abortError = new Error('The operation was aborted')
    abortError.name = 'AbortError'
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError))
    const result = await testTelegramConnection({ botToken: TOKEN, chatId: CHAT })
    expect(result.success).toBe(false)
    expect(result.errorCode).toBe('TIMEOUT')
  })

  it('reports NOT_CONFIGURED when credentials are missing', async () => {
    const result = await testTelegramConnection({})
    expect(result.success).toBe(false)
    expect(result.errorCode).toBe('NOT_CONFIGURED')
  })

  it('sends a test message and returns the message id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, { ok: true, result: { message_id: 42 } }),
      ),
    )
    const { messageId } = await sendTelegramMessage(TOKEN, CHAT, 'hello')
    expect(messageId).toBe(42)
  })

  it('exposes getMe / getChat validators directly', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(200, { ok: true, result: { username: 'x_bot' } }))
        .mockResolvedValueOnce(jsonResponse(200, { ok: true, result: { type: 'channel' } })),
    )
    await expect(validateTelegramBot(TOKEN)).resolves.toEqual({ username: 'x_bot' })
    await expect(validateTelegramDestination(TOKEN, CHAT)).resolves.toEqual({
      type: 'channel',
      available: true,
    })
  })
})
