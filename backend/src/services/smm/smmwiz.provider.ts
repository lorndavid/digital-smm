import { env } from '../../config/env.js'
import { logger } from '../../utils/logger.js'
import type {
  CreateOrderInput,
  ProviderBalance,
  ProviderCancelResult,
  ProviderOrderStatus,
  ProviderRefillStatus,
  ProviderService,
  SmmProvider,
} from '../../interfaces/smm-provider.interface.js'

interface ApiErrorBody {
  error?: string
}

/**
 * smmwiz.com API v2 client.
 *
 * Docs (see project guide):
 *  - POST https://smmwiz.com/api/v2 with form params: key + action
 *  - actions: services | add | status | refill | refill_status | cancel | balance
 *
 * All responses are JSON. Numeric fields arrive as strings, so they are
 * coerced at the boundary of this class.
 */
export class SmmWizProvider implements SmmProvider {
  readonly name = 'smmwiz'

  constructor(
    private readonly apiUrl: string = env.SMMWIZ_API_URL,
    private readonly apiKey: string = env.SMMWIZ_API_KEY ?? '',
  ) {
    if (!this.apiKey) {
      logger.warn('[smmwiz] SMMWIZ_API_KEY is not set — provider calls will fail until configured')
    }
  }

  private async request<T>(params: Record<string, string | number | undefined>): Promise<T> {
    const body = new URLSearchParams()
    body.set('key', this.apiKey)
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        body.set(key, String(value))
      }
    }

    const res = await fetch(this.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      throw new Error(`[smmwiz] HTTP ${res.status} from provider`)
    }

    const json = (await res.json()) as T & ApiErrorBody
    if (typeof json.error === 'string') {
      throw new Error(`[smmwiz] ${json.error}`)
    }
    return json
  }

  async getServices(): Promise<ProviderService[]> {
    const raw = await this.request<
      Array<{
        service: string
        name: string
        type: string
        category: string
        rate: string
        min: string
        max: string
        refill: boolean
        cancel: boolean
      }>
    >({ action: 'services' })

    return raw.map((s) => ({
      providerServiceId: Number(s.service),
      name: s.name,
      type: (s.type as ProviderService['type']) || 'Default',
      category: s.category,
      rate: Number(s.rate) || 0,
      min: Number(s.min) || 0,
      max: Number(s.max) || 0,
      refill: Boolean(s.refill),
      cancel: Boolean(s.cancel),
    }))
  }

  async createOrder(input: CreateOrderInput): Promise<{ order: number }> {
    const params: Record<string, string | number | undefined> = {
      action: 'add',
      service: input.service,
      link: input.link,
      quantity: input.quantity,
      runs: input.runs,
      interval: input.interval,
      keywords: input.keywords?.join('\n'),
      comments: input.comments?.join('\n'),
      usernames: input.usernames?.join('\n'),
      username: input.username,
      answer_number: input.answerNumber,
      groups: input.groups?.join('\n'),
      min: input.min,
      max: input.max,
      posts: input.posts,
      old_posts: input.oldPosts,
      delay: input.delay,
      expiry: input.expiry,
      country: input.country,
      device: input.device,
      type_of_traffic: input.typeOfTraffic,
      google_keyword: input.googleKeyword,
      referring_url: input.referringUrl,
    }
    const result = await this.request<{ order: string }>(params)
    return { order: Number(result.order) }
  }

  async getOrderStatus(orderId: number): Promise<ProviderOrderStatus> {
    const result = await this.request<ProviderOrderStatus>({ action: 'status', order: orderId })
    return this.coerceOrderStatus(result)
  }

  async getOrdersStatus(orderIds: number[]): Promise<Record<string, ProviderOrderStatus>> {
    const raw = await this.request<Record<string, ProviderOrderStatus>>({
      action: 'status',
      orders: orderIds.join(','),
    })
    const coerced: Record<string, ProviderOrderStatus> = {}
    for (const [key, value] of Object.entries(raw)) {
      coerced[key] = this.coerceOrderStatus(value)
    }
    return coerced
  }

  async createRefill(orderId: number): Promise<{ refill: number }> {
    const result = await this.request<{ refill: string }>({ action: 'refill', order: orderId })
    return { refill: Number(result.refill) }
  }

  async createRefills(
    orderIds: number[],
  ): Promise<Array<{ order: number; refill: number | { error: string } }>> {
    return this.request<Array<{ order: number; refill: number | { error: string } }>>({
      action: 'refill',
      orders: orderIds.join(','),
    })
  }

  async getRefillStatus(refillId: number): Promise<ProviderRefillStatus> {
    const raw = await this.request<ProviderRefillStatus>({ action: 'refill_status', refill: refillId })
    return { refill: raw.refill, status: raw.status, error: raw.error }
  }

  async getRefillsStatus(refillIds: number[]): Promise<ProviderRefillStatus[]> {
    return this.request<ProviderRefillStatus[]>({
      action: 'refill_status',
      refills: refillIds.join(','),
    })
  }

  async cancelOrders(orderIds: number[]): Promise<ProviderCancelResult[]> {
    return this.request<ProviderCancelResult[]>({ action: 'cancel', orders: orderIds.join(',') })
  }

  async getBalance(): Promise<ProviderBalance> {
    const raw = await this.request<{ balance: string; currency: string }>({ action: 'balance' })
    return { balance: Number(raw.balance) || 0, currency: raw.currency }
  }

  /** Numeric status fields arrive as strings in the provider payload. */
  private coerceOrderStatus(raw: ProviderOrderStatus): ProviderOrderStatus {
    return {
      order: Number(raw.order) || 0,
      charge: raw.charge !== undefined ? Number(raw.charge) : undefined,
      startCount: raw.startCount !== undefined ? Number(raw.startCount) : undefined,
      status: raw.status,
      remains: raw.remains !== undefined ? Number(raw.remains) : undefined,
      currency: raw.currency,
      error: raw.error,
    }
  }
}
