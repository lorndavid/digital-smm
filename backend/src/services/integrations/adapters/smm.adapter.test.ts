import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    CREDENTIAL_ENCRYPTION_KEY: 'a'.repeat(64),
    INTEGRATION_HEALTH_INTERVAL_MS: 1_800_000,
    ENABLE_INTEGRATION_HEALTH_JOB: true,
    SMMWIZ_API_URL: 'https://wizsmm.com/api/v2',
    SMMWIZ_API_KEY: 'test',
  },
  corsOrigins: [],
}))

import { getSmmClient, testSmmConnection } from './smm.adapter.js'

const API_KEY = 'abcdefghijklmnopqrstuvwxyz0123456789'

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

describe('smm adapter', () => {
  it('reports CONNECTED with balance from the provider', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, { balance: '124.82', currency: 'USD' })),
    )
    const result = await testSmmConnection({ apiKey: API_KEY }, { baseUrl: 'https://wizsmm.com/api/v2' })
    expect(result.success).toBe(true)
    expect(result.status).toBe('CONNECTED')
    expect(result.details).toEqual({ balance: 124.82, currency: 'USD' })
  })

  it('maps an HTTP 401 to INVALID_CREDENTIALS', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(401, { error: 'Unauthorized' })),
    )
    const result = await testSmmConnection({ apiKey: 'wrong-key' }, { baseUrl: 'https://wizsmm.com/api/v2' })
    expect(result.success).toBe(false)
    expect(result.errorCode).toBe('INVALID_CREDENTIALS')
  })

  it('maps a provider error message to INVALID_CREDENTIALS', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, { error: 'Incorrect API key' })),
    )
    const result = await testSmmConnection({ apiKey: 'wrong-key' }, { baseUrl: 'https://wizsmm.com/api/v2' })
    expect(result.success).toBe(false)
    expect(result.errorCode).toBe('INVALID_CREDENTIALS')
  })

  it('maps network failure to NETWORK_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))
    const result = await testSmmConnection({ apiKey: API_KEY }, { baseUrl: 'https://wizsmm.com/api/v2' })
    expect(result.success).toBe(false)
    expect(result.errorCode).toBe('NETWORK_ERROR')
  })

  it('reports NOT_CONFIGURED when baseUrl or apiKey is missing', async () => {
    const missingKey = await testSmmConnection({}, { baseUrl: 'https://wizsmm.com/api/v2' })
    expect(missingKey.errorCode).toBe('NOT_CONFIGURED')
    const missingUrl = await testSmmConnection({ apiKey: API_KEY }, {})
    expect(missingUrl.errorCode).toBe('NOT_CONFIGURED')
  })

  it('builds a real provider client with decrypted credentials', () => {
    const client = getSmmClient({ apiKey: API_KEY }, { baseUrl: 'https://wizsmm.com/api/v2' })
    expect(client.name).toBe('smmwiz')
  })
})
