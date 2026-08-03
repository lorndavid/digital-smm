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
 * Rates are expressed per unit (e.g. 0.0009 USD per follower, i.e.
 * $0.90 per 1,000) which matches how the real provider charges.
 */
export class MockProvider implements SmmProvider {
  readonly name = 'mock'
  private sequence = 1

  async getServices(): Promise<ProviderService[]> {
    const raw = [
      { providerServiceId: 1, name: 'TikTok Followers', type: 'Default', category: 'TikTok', rate: 0.0009, min: 50, max: 10000, refill: true, cancel: true },
      { providerServiceId: 2, name: 'TikTok Likes', type: 'Default', category: 'TikTok', rate: 0.0006, min: 50, max: 50000, refill: true, cancel: true },
      { providerServiceId: 3, name: 'TikTok Views (High Retention)', type: 'Default', category: 'TikTok', rate: 0.0005, min: 100, max: 100000, refill: true, cancel: false },
      { providerServiceId: 4, name: 'TikTok Custom Comments', type: 'Custom Comments', category: 'TikTok', rate: 0.008, min: 10, max: 500, refill: false, cancel: true },
      { providerServiceId: 5, name: 'Facebook Page Likes', type: 'Default', category: 'Facebook', rate: 0.0011, min: 50, max: 20000, refill: true, cancel: true },
      { providerServiceId: 6, name: 'Facebook Post Likes', type: 'Default', category: 'Facebook', rate: 0.0007, min: 50, max: 50000, refill: true, cancel: true },
      { providerServiceId: 7, name: 'Facebook Video Views', type: 'Default', category: 'Facebook', rate: 0.0004, min: 100, max: 100000, refill: true, cancel: false },
      { providerServiceId: 8, name: 'Instagram Followers', type: 'Default', category: 'Instagram', rate: 0.001, min: 50, max: 20000, refill: true, cancel: true },
      { providerServiceId: 9, name: 'Instagram Reels Likes', type: 'Default', category: 'Instagram', rate: 0.0006, min: 50, max: 50000, refill: true, cancel: true },
      { providerServiceId: 10, name: 'Instagram Views', type: 'Default', category: 'Instagram', rate: 0.0003, min: 100, max: 200000, refill: true, cancel: false },
      { providerServiceId: 11, name: 'YouTube Subscribers', type: 'Default', category: 'YouTube', rate: 0.004, min: 20, max: 5000, refill: true, cancel: true },
      { providerServiceId: 12, name: 'YouTube Views', type: 'Default', category: 'YouTube', rate: 0.0008, min: 100, max: 200000, refill: true, cancel: true },
      { providerServiceId: 13, name: 'YouTube Likes', type: 'Default', category: 'YouTube', rate: 0.0012, min: 50, max: 50000, refill: true, cancel: true },
      { providerServiceId: 14, name: 'Telegram Members', type: 'Default', category: 'Telegram', rate: 0.0015, min: 50, max: 20000, refill: true, cancel: true },
      { providerServiceId: 15, name: 'Telegram Post Views', type: 'Default', category: 'Telegram', rate: 0.0005, min: 100, max: 100000, refill: true, cancel: false },
      { providerServiceId: 16, name: 'Telegram Invites from Groups', type: 'Invites from Groups', category: 'Telegram', rate: 0.004, min: 10, max: 2000, refill: false, cancel: true },
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
