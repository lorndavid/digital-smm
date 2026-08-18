import { beforeEach, describe, expect, it, vi } from 'vitest'

// The client is mocked so tests exercise the service logic (level gate +
// dedup) without network calls.
vi.mock('./telegram.client.js', () => ({
  sendTelegramMessage: vi.fn(async () => true),
  isTelegramConfigured: () => true,
}))

import { sendTelegramMessage } from './telegram.client.js'
import { TelegramService } from './telegram.service.js'
import type { NotificationEvent } from '../notification.types.js'

const sendMock = vi.mocked(sendTelegramMessage)

function makeService(cooldownMs = 60_000, minLevel: NotificationEvent['level'] = 'warning') {
  return new TelegramService({
    botToken: 'test-token',
    chatId: '123',
    enabled: true,
    minLevel,
    cooldownMs,
  })
}

const baseEvent: NotificationEvent = {
  level: 'error',
  service: 'backend',
  event: 'db_down',
  message: 'Database unavailable',
}

describe('TelegramService', () => {
  beforeEach(() => {
    sendMock.mockClear()
  })

  it('sends when the level is at or above the minimum', async () => {
    const service = makeService()
    const ok = await service.notify(baseEvent)
    expect(ok).toBe(true)
    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(sendMock.mock.calls[0]?.[0]).toContain('DigitalSMM ERROR')
  })

  it('blocks levels below the minimum (no send, no throw)', async () => {
    const service = makeService()
    const ok = await service.notify({ ...baseEvent, level: 'info' })
    expect(ok).toBe(false)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('is a no-op when not configured (fail-safe)', async () => {
    const service = new TelegramService({
      botToken: '',
      chatId: '',
      enabled: true,
      minLevel: 'warning',
      cooldownMs: 60_000,
    })
    const ok = await service.notify(baseEvent)
    expect(ok).toBe(false)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('deduplicates identical events inside the cooldown window', async () => {
    const service = makeService(60_000)
    await service.notify(baseEvent)
    await service.notify(baseEvent)
    await service.notify(baseEvent)
    expect(sendMock).toHaveBeenCalledTimes(1)
  })

  it('sends one aggregated spike alert after the cooldown elapses', async () => {
    vi.useFakeTimers()
    try {
      const service = makeService(60_000)
      await service.notify(baseEvent) // send #1
      await service.notify(baseEvent) // suppressed
      expect(sendMock).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(60_001)
      const ok = await service.notify(baseEvent)
      expect(ok).toBe(true)
      expect(sendMock).toHaveBeenCalledTimes(2)
      // The aggregated message reports the total occurrences (1 sent + 2 suppressed).
      expect(sendMock.mock.calls[1]?.[0]).toContain('Occurrences: 3')
    } finally {
      vi.useRealTimers()
    }
  })

  it('treats different events as independent (no cross-key dedup)', async () => {
    const service = makeService(60_000)
    await service.notify(baseEvent)
    await service.notify({ ...baseEvent, event: 'redis_down' })
    expect(sendMock).toHaveBeenCalledTimes(2)
  })

  it('never throws on send failure (fail-safe)', async () => {
    sendMock.mockRejectedValueOnce(new Error('network down'))
    const service = makeService()
    await expect(service.notify(baseEvent)).resolves.toBe(false)
  })
})
