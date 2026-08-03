import { afterEach, describe, expect, it, vi } from 'vitest'
import { SmmWizProvider } from './smmwiz.provider.js'

// The provider imports the env module at load time; provide a minimal stub
// so the test never touches .env validation.
vi.mock('../../config/env.js', () => ({
  env: {
    SMMWIZ_API_URL: 'https://smmwiz.com/api/v2',
    SMMWIZ_API_KEY: 'test-key',
  },
  corsOrigins: [],
}))

const originalFetch = globalThis.fetch

function stubFetch(json: unknown): (body?: string) => void {
  let captured: string | undefined
  globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
    captured = init?.body as string | undefined
    return new Response(JSON.stringify(json), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as unknown as typeof fetch
  return () => captured
}

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('SmmWizProvider', () => {
  it('posts form-encoded params including the API key and action', async () => {
    const getBody = stubFetch({ order: '23501' })
    const provider = new SmmWizProvider('https://smmwiz.com/api/v2', 'key-123')

    const result = await provider.createOrder({
      service: 7,
      link: 'https://tiktok.com/@user/video/1',
      quantity: 100,
    })

    expect(result.order).toBe(23501)
    const body = new URLSearchParams(getBody() ?? '')
    expect(body.get('key')).toBe('key-123')
    expect(body.get('action')).toBe('add')
    expect(body.get('service')).toBe('7')
    expect(body.get('link')).toBe('https://tiktok.com/@user/video/1')
    expect(body.get('quantity')).toBe('100')
  })

  it('joins list fields (comments) with newlines', async () => {
    const getBody = stubFetch({ order: '42' })
    const provider = new SmmWizProvider('https://smmwiz.com/api/v2', 'key-123')

    await provider.createOrder({
      service: 2,
      link: 'https://instagram.com/p/abc',
      comments: ['Nice!', 'Great post'],
    })

    const body = new URLSearchParams(getBody() ?? '')
    expect(body.get('comments')).toBe('Nice!\nGreat post')
  })

  it('omits undefined optional fields', async () => {
    const getBody = stubFetch({ order: '42' })
    const provider = new SmmWizProvider('https://smmwiz.com/api/v2', 'key-123')

    await provider.createOrder({ service: 1, link: 'https://x.com', quantity: 10 })

    const body = new URLSearchParams(getBody() ?? '')
    expect(body.has('runs')).toBe(false)
    expect(body.has('interval')).toBe(false)
    expect(body.has('comments')).toBe(false)
  })

  it('throws when the provider returns an error body', async () => {
    stubFetch({ error: 'Incorrect order ID' })
    const provider = new SmmWizProvider('https://smmwiz.com/api/v2', 'key-123')

    await expect(
      provider.createOrder({ service: 1, link: 'https://x.com', quantity: 10 }),
    ).rejects.toThrow('Incorrect order ID')
  })

  it('coerces string numeric status fields', async () => {
    stubFetch({ order: '12', charge: '1.50', status: 'Completed', remains: '0', currency: 'USD' })
    const provider = new SmmWizProvider('https://smmwiz.com/api/v2', 'key-123')

    const status = await provider.getOrderStatus(12)
    expect(status.charge).toBe(1.5)
    expect(status.remains).toBe(0)
    expect(status.status).toBe('Completed')
  })

  it('maps provider services to the internal shape', async () => {
    stubFetch([
      {
        service: '1',
        name: 'Followers',
        type: 'Default',
        category: 'TikTok',
        rate: '0.90',
        min: '50',
        max: '10000',
        refill: true,
        cancel: true,
      },
    ])
    const provider = new SmmWizProvider('https://smmwiz.com/api/v2', 'key-123')

    const services = await provider.getServices()
    expect(services[0]).toMatchObject({
      providerServiceId: 1,
      name: 'Followers',
      rate: 0.9,
      min: 50,
      max: 10000,
      refill: true,
      cancel: true,
    })
  })
})
