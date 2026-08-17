import { describe, expect, it, vi } from 'vitest'

// The logger imports env at load — stub it like the other tests. Use
// production so the logger emits JSON (dev pretty-prints for humans).
vi.mock('../config/env.js', () => ({
  env: { NODE_ENV: 'production' },
  corsOrigins: [],
}))

import { generateRequestId, getRequestId, runWithRequestContext } from '../utils/request-context.js'
import { logger } from '../utils/logger.js'

describe('request context (correlation ids)', () => {
  it('generates unique, non-empty ids', () => {
    const a = generateRequestId()
    const b = generateRequestId()
    expect(a).toBeTruthy()
    expect(a).not.toBe(b)
  })

  it('is null outside a request context', () => {
    expect(getRequestId()).toBeNull()
  })

  it('exposes the request id inside a context', () => {
    const id = runWithRequestContext(() => getRequestId())
    expect(id).toBeTruthy()
  })

  it('nests contexts (inner wins)', () => {
    runWithRequestContext(() => {
      const inner = runWithRequestContext(() => getRequestId(), 'inner-id')
      expect(inner).toBe('inner-id')
      expect(getRequestId()).not.toBe('inner-id')
    }, 'outer-id')
  })
})

describe('structured logger', () => {
  it('emits a JSON line with service + level + message', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    try {
      logger.info('hello')
      expect(spy).toHaveBeenCalledTimes(1)
      const line = String(spy.mock.calls[0]?.[0] ?? '')
      const parsed = JSON.parse(line) as Record<string, unknown>
      expect(parsed.service).toBe('backend')
      expect(parsed.level).toBe('info')
      expect(parsed.message).toBe('hello')
      expect(parsed.timestamp).toBeTruthy()
    } finally {
      spy.mockRestore()
    }
  })

  it('serializes Error meta into a safe object (never the raw object)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      logger.error('boom', new Error('kaboom'))
      const line = String(spy.mock.calls[0]?.[0] ?? '')
      const parsed = JSON.parse(line) as { level?: string; meta?: { message?: string } }
      expect(parsed.level).toBe('error')
      expect(parsed.meta?.message).toBe('kaboom')
    } finally {
      spy.mockRestore()
    }
  })
})
