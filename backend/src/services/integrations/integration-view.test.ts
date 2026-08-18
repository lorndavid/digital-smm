import { describe, expect, it, vi } from 'vitest'

vi.mock('../../config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    CREDENTIAL_ENCRYPTION_KEY: 'a'.repeat(64),
    INTEGRATION_HEALTH_INTERVAL_MS: 1_800_000,
    ENABLE_INTEGRATION_HEALTH_JOB: true,
  },
  corsOrigins: [],
}))

import { encryptSecret } from './credential-crypto.service.js'
import {
  applySecretUpdate,
  effectiveStatus,
  isConfigured,
  secretColumnForField,
  toSafeView,
} from './integration-view.js'

const TOKEN = '123456789:ABCdefGHIjkLMNOPqrsTUVwxyz0123456789ab'
const CHAT_ID = '-1001234567890'

function telegramDoc(overrides: Record<string, unknown> = {}) {
  return {
    provider: 'telegram',
    displayName: 'Support bot',
    isEnabled: true,
    status: 'CONNECTED',
    secrets: {
      botToken: encryptSecret(TOKEN),
      chatId: encryptSecret(CHAT_ID),
    },
    metadata: { destinationType: 'supergroup' },
    lastTestedAt: new Date('2026-08-18T05:00:00Z'),
    lastSuccessfulAt: new Date('2026-08-18T05:00:00Z'),
    lastFailedAt: null,
    lastErrorCode: '',
    lastErrorMessage: '',
    latencyMs: 284,
    connectionHistory: [
      { testedAt: new Date('2026-08-18T05:00:00Z'), success: true, latencyMs: 284, errorCode: '' },
    ],
    ...overrides,
  }
}

describe('toSafeView — SECURITY (secrets never leave the backend)', () => {
  it('returns masked credentials only, never plaintext', () => {
    const view = toSafeView(telegramDoc())
    const serialized = JSON.stringify(view)

    expect(view.credentials.botToken).toEqual({ configured: true, masked: '••••••••••••' })
    expect(view.credentials.chatId).toEqual({ configured: true, masked: '••••••••••••7890' })
    expect(serialized).not.toContain(TOKEN)
    expect(serialized).not.toContain(CHAT_ID)
    expect(serialized).not.toContain('botToken":"') // only `configured`/`masked` shapes
  })

  it('never includes the raw secrets subdocument', () => {
    const serialized = JSON.stringify(toSafeView(telegramDoc()))
    expect(serialized).not.toContain('ciphertext')
    expect(serialized).not.toContain('encrypt')
  })

  it('reports configured=false + null mask for unconfigured providers', () => {
    const view = toSafeView({ provider: 'telegram', secrets: null })
    expect(view.configured).toBe(false)
    expect(view.credentials.botToken).toEqual({ configured: false, masked: null })
    expect(view.credentials.chatId).toEqual({ configured: false, masked: null })
  })

  it('includes non-secret config and history', () => {
    const view = toSafeView(telegramDoc())
    expect(view.config.destinationType).toBe('supergroup')
    expect(view.connectionHistory).toHaveLength(1)
    expect(view.connectionHistory[0]!.success).toBe(true)
    expect(view.connectionHistory[0]!.latencyMs).toBe(284)
  })

  it('status reflects DISABLED even when previously CONNECTED', () => {
    expect(effectiveStatus(telegramDoc({ isEnabled: false }))).toBe('DISABLED')
    expect(effectiveStatus(telegramDoc())).toBe('CONNECTED')
    expect(effectiveStatus({ isEnabled: true, status: 'CONNECTED', secrets: null })).toBe(
      'NOT_CONFIGURED',
    )
  })
})

describe('applySecretUpdate — keep/clear/replace semantics', () => {
  const encrypt = (v: string) => `enc:${v}`

  it('undefined keeps the existing encrypted value', () => {
    expect(applySecretUpdate('botToken', 'existing-cipher', undefined, encrypt)).toEqual({})
  })

  it('empty string clears an existing secret', () => {
    expect(applySecretUpdate('apiKey', 'existing-cipher', '', encrypt)).toEqual({ apiKey: null })
  })

  it('empty string on an unset secret is a no-op', () => {
    expect(applySecretUpdate('apiKey', null, '', encrypt)).toEqual({})
  })

  it('a new value is encrypted and replaces the old one', () => {
    expect(applySecretUpdate('apiKey', 'old-cipher', 'new-key-value', encrypt)).toEqual({
      apiKey: 'enc:new-key-value',
    })
  })
})

describe('field mapping', () => {
  it('maps provider fields to secret columns', () => {
    expect(secretColumnForField('botToken')).toBe('botToken')
    expect(secretColumnForField('chatId')).toBe('chatId')
    expect(secretColumnForField('apiKey')).toBe('apiKey')
    expect(secretColumnForField('apiSecret')).toBe('apiSecret')
    expect(secretColumnForField('webhookSecret')).toBe('webhookSecret')
    expect(secretColumnForField('baseUrl')).toBeUndefined()
  })

  it('isConfigured requires at least one secret', () => {
    expect(isConfigured({ secrets: { botToken: 'x' } })).toBe(true)
    expect(isConfigured({ secrets: {} })).toBe(false)
    expect(isConfigured({ secrets: null })).toBe(false)
  })
})
