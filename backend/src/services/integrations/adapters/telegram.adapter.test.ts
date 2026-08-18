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
  sendTelegramMessageToAll,
  testTelegramConnection,
  validateTelegramBot,
  validateTelegramDestination,
} from './telegram.adapter.js'

const TOKEN = '123456789:ABCdefGHIjkLMNOPqrsTUVwxyz0123456789ab'
const PRIVATE_CHAT = '123456789'
const GROUP_CHAT = '-1001234567890'

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
  it('validates the bot and EVERY destination on test', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { ok: true, result: { username: 'digitalsmm_bot' } }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true, result: { type: 'supergroup' } }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true, result: { type: 'channel' } }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await testTelegramConnection(
      { botToken: TOKEN },
      [
        { type: 'supergroup', chatId: GROUP_CHAT },
        { type: 'channel', chatId: '@digitalsmm_news' },
      ],
    )

    expect(result.success).toBe(true)
    expect(result.status).toBe('CONNECTED')
    const dests = (result.details?.destinations as Array<{ type: string; ok: boolean }>) ?? []
    expect(dests).toHaveLength(2)
    expect(dests.every((d) => d.ok)).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    // No secrets in any URL or payload.
    for (const call of fetchMock.mock.calls) {
      expect(JSON.stringify(call)).not.toContain('botToken')
      expect(JSON.stringify(call)).not.toContain('token":')
    }
  })

  it('fails the whole test when ONE destination is invalid', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(200, { ok: true, result: { username: 'bot' } }))
        .mockResolvedValueOnce(jsonResponse(200, { ok: true, result: { type: 'group' } }))
        .mockResolvedValueOnce(
          jsonResponse(400, { ok: false, error_code: 400, description: 'Bad Request: chat not found' }),
        ),
    )
    const result = await testTelegramConnection(
      { botToken: TOKEN },
      [
        { type: 'group', chatId: '-1234567890' },
        { type: 'private', chatId: PRIVATE_CHAT },
      ],
    )
    expect(result.success).toBe(false)
    expect(result.status).toBe('CONNECTION_FAILED')
    const dests = (result.details?.destinations as Array<{ ok: boolean; errorCode?: string }>) ?? []
    expect(dests[0]!.ok).toBe(true)
    expect(dests[1]!.ok).toBe(false)
  })

  it('accepts a personal chat after the user pressed Start (getUpdates fallback)', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(200, { ok: true, result: { username: 'bot' } }))
        .mockResolvedValueOnce(
          jsonResponse(400, { ok: false, error_code: 400, description: 'Bad Request: chat not found' }),
        )
        // getUpdates: the user has started the bot → their chat id appears.
        .mockResolvedValueOnce(
          jsonResponse(200, {
            ok: true,
            result: [{ update_id: 1, message: { chat: { id: Number(PRIVATE_CHAT), type: 'private' } } }],
          }),
        ),
    )
    const result = await testTelegramConnection({ botToken: TOKEN }, [{ type: 'private', chatId: PRIVATE_CHAT }])
    expect(result.success).toBe(true)
    expect(result.status).toBe('CONNECTED')
  })

  it('explains the Start requirement when a private chat is not reachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(200, { ok: true, result: { username: 'bot' } }))
        .mockResolvedValueOnce(
          jsonResponse(400, { ok: false, error_code: 400, description: 'Bad Request: chat not found' }),
        )
        .mockResolvedValueOnce(jsonResponse(200, { ok: true, result: [] })), // no updates yet
    )
    const result = await testTelegramConnection({ botToken: TOKEN }, [{ type: 'private', chatId: PRIVATE_CHAT }])
    expect(result.success).toBe(false)
    expect(result.status).toBe('CONNECTION_FAILED')
    const dests = (result.details?.destinations as Array<{ ok: boolean; errorCode?: string; message?: string }>) ?? []
    expect(dests[0]?.errorCode).toBe('INVALID_DESTINATION')
    expect(dests[0]?.message).toMatch(/Start/i)
  })

  it('maps a 401 from getMe to INVALID_CREDENTIALS', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(401, { ok: false, error_code: 401, description: 'Unauthorized' }),
      ),
    )
    const result = await testTelegramConnection({ botToken: TOKEN }, [{ type: 'private', chatId: PRIVATE_CHAT }])
    expect(result.success).toBe(false)
    expect(result.errorCode).toBe('INVALID_CREDENTIALS')
  })

  it('maps a fetch abort to TIMEOUT', async () => {
    const abortError = new Error('The operation was aborted')
    abortError.name = 'AbortError'
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError))
    const result = await testTelegramConnection({ botToken: TOKEN }, [{ type: 'private', chatId: PRIVATE_CHAT }])
    expect(result.success).toBe(false)
    expect(result.errorCode).toBe('TIMEOUT')
  })

  it('reports NOT_CONFIGURED when no destinations exist', async () => {
    const result = await testTelegramConnection({ botToken: TOKEN }, [])
    expect(result.success).toBe(false)
    expect(result.errorCode).toBe('NOT_CONFIGURED')
  })

  it('sends a message to one chat and returns the message id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, { ok: true, result: { message_id: 42 } }),
      ),
    )
    const { messageId } = await sendTelegramMessage(TOKEN, PRIVATE_CHAT, 'hello')
    expect(messageId).toBe(42)
  })

  it('sends to every destination and reports per-chat results', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(200, { ok: true, result: { message_id: 1 } }))
        .mockResolvedValueOnce(
          jsonResponse(400, { ok: false, error_code: 400, description: 'Bad Request: chat not found' }),
        ),
    )
    const results = await sendTelegramMessageToAll(TOKEN, [
      { type: 'private', chatId: PRIVATE_CHAT },
      { type: 'group', chatId: '-9999999999' },
    ], 'hi')
    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({ ok: true, messageId: 1 })
    expect(results[1]).toMatchObject({ ok: false, errorCode: 'INVALID_DESTINATION' })
    // Masked chat ids — never the plaintext.
    expect(results[0]!.chatId).not.toContain(PRIVATE_CHAT)
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
    await expect(validateTelegramDestination(TOKEN, '@digitalsmm_news')).resolves.toEqual({
      type: 'channel',
      available: true,
    })
  })
})
