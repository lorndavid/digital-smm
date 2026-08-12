import type {
  CreateOrderInput,
  ProviderBalance,
  ProviderCancelResult,
  ProviderOrderStatus,
  ProviderRefillStatus,
  ProviderService,
  SmmProvider,
} from '../../interfaces/smm-provider.interface.js'

/**
 * In-memory mock provider. Lets the whole order pipeline run locally
 * without an smmwiz API key (set SMM_PROVIDER=mock).
 *
 * Rates are expressed per 1,000 units (the same semantic as the real
 * smmwiz `rate` field), e.g. 0.9 = $0.90 per 1,000 followers.
 */
export class MockProvider implements SmmProvider {
  readonly name = 'mock'
  private sequence = 1

  async getServices(): Promise<ProviderService[]> {
    const raw = [
      { providerServiceId: 1, name: 'TikTok Followers', type: 'Default', category: 'TikTok', rate: 0.9, min: 50, max: 10000, refill: true, cancel: true },
      { providerServiceId: 2, name: 'TikTok Likes', type: 'Default', category: 'TikTok', rate: 0.6, min: 50, max: 50000, refill: true, cancel: true },
      { providerServiceId: 3, name: 'TikTok Views (High Retention)', type: 'Default', category: 'TikTok', rate: 0.5, min: 100, max: 100000, refill: true, cancel: false },
      { providerServiceId: 4, name: 'TikTok Custom Comments', type: 'Custom Comments', category: 'TikTok', rate: 8, min: 10, max: 500, refill: false, cancel: true },
      { providerServiceId: 5, name: 'Facebook Page Likes', type: 'Default', category: 'Facebook', rate: 1.1, min: 50, max: 20000, refill: true, cancel: true },
      { providerServiceId: 6, name: 'Facebook Post Likes', type: 'Default', category: 'Facebook', rate: 0.7, min: 50, max: 50000, refill: true, cancel: true },
      { providerServiceId: 7, name: 'Facebook Video Views', type: 'Default', category: 'Facebook', rate: 0.4, min: 100, max: 100000, refill: true, cancel: false },
      { providerServiceId: 8, name: 'Instagram Followers', type: 'Default', category: 'Instagram', rate: 1, min: 50, max: 20000, refill: true, cancel: true },
      { providerServiceId: 9, name: 'Instagram Reels Likes', type: 'Default', category: 'Instagram', rate: 0.6, min: 50, max: 50000, refill: true, cancel: true },
      { providerServiceId: 10, name: 'Instagram Views', type: 'Default', category: 'Instagram', rate: 0.3, min: 100, max: 200000, refill: true, cancel: false },
      { providerServiceId: 11, name: 'YouTube Subscribers', type: 'Default', category: 'YouTube', rate: 4, min: 20, max: 5000, refill: true, cancel: true },
      { providerServiceId: 12, name: 'YouTube Views', type: 'Default', category: 'YouTube', rate: 0.8, min: 100, max: 200000, refill: true, cancel: true },
      { providerServiceId: 13, name: 'YouTube Likes', type: 'Default', category: 'YouTube', rate: 1.2, min: 50, max: 50000, refill: true, cancel: true },
      { providerServiceId: 14, name: 'Telegram Members', type: 'Default', category: 'Telegram', rate: 1.5, min: 50, max: 20000, refill: true, cancel: true },
      { providerServiceId: 15, name: 'Telegram Post Views', type: 'Default', category: 'Telegram', rate: 0.5, min: 100, max: 100000, refill: true, cancel: false },
      { providerServiceId: 16, name: 'Telegram Invites from Groups', type: 'Invites from Groups', category: 'Telegram', rate: 4, min: 10, max: 2000, refill: false, cancel: true },
      // Live / stream services — mirror the real SMMWiz catalogue so the
      // 'Facebook Live' quick filter and live-stream searches have data.
      { providerServiceId: 17, name: 'Facebook Live Stream Views', type: 'Default', category: 'Facebook Live Stream', rate: 0.8, min: 100, max: 100000, refill: true, cancel: false },
      { providerServiceId: 18, name: 'Facebook Live Stream Likes', type: 'Default', category: 'Facebook Live Stream', rate: 0.5, min: 50, max: 50000, refill: true, cancel: true },
      { providerServiceId: 19, name: 'Facebook Live Stream Comments', type: 'Custom Comments', category: 'Facebook Live Stream', rate: 4, min: 10, max: 2000, refill: false, cancel: true },
      { providerServiceId: 20, name: 'TikTok Live Stream Views', type: 'Default', category: 'TikTok Live Stream', rate: 0.6, min: 100, max: 100000, refill: true, cancel: false },
      { providerServiceId: 21, name: 'TikTok Live Stream Likes', type: 'Default', category: 'TikTok Live Stream', rate: 0.4, min: 50, max: 50000, refill: true, cancel: true },
      { providerServiceId: 22, name: 'YouTube Live Stream Views', type: 'Default', category: 'YouTube Live', rate: 0.9, min: 100, max: 200000, refill: true, cancel: false },
    ]
    return raw.map((s) => ({ ...s, type: s.type as ProviderService['type'] }))
  }

  async createOrder(_input: CreateOrderInput): Promise<{ order: number }> {
    return { order: this.sequence++ }
  }

  async getOrderStatus(orderId: number): Promise<ProviderOrderStatus> {
    return {
      order: orderId,
      charge: 0,
      startCount: 0,
      status: 'In progress',
      remains: 0,
      currency: 'USD',
    }
  }

  async getOrdersStatus(orderIds: number[]): Promise<Record<string, ProviderOrderStatus>> {
    const result: Record<string, ProviderOrderStatus> = {}
    for (const id of orderIds) {
      result[String(id)] = await this.getOrderStatus(id)
    }
    return result
  }

  async createRefill(orderId: number): Promise<{ refill: number }> {
    return { refill: orderId }
  }

  async createRefills(
    orderIds: number[],
  ): Promise<Array<{ order: number; refill: number | { error: string } }>> {
    return orderIds.map((order) => ({ order, refill: order }))
  }

  async getRefillStatus(refillId: number): Promise<ProviderRefillStatus> {
    return { refill: refillId, status: 'Completed' }
  }

  async getRefillsStatus(refillIds: number[]): Promise<ProviderRefillStatus[]> {
    return refillIds.map((refill) => ({ refill, status: 'Completed' }))
  }

  async cancelOrders(orderIds: number[]): Promise<ProviderCancelResult[]> {
    return orderIds.map((order) => ({ order, cancel: 1 }))
  }

  async getBalance(): Promise<ProviderBalance> {
    return { balance: 999.99, currency: 'USD' }
  }
}
