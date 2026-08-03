import type { ServiceType } from '../types/index.js'

/**
 * Contract for an SMM order provider (e.g. smmwiz.com API v2).
 * New providers implement this interface and are registered in
 * `services/smm/provider.factory.ts`.
 */

export interface ProviderService {
  /** The service id as known by the provider. */
  providerServiceId: number
  name: string
  type: ServiceType
  category: string
  rate: number
  min: number
  max: number
  refill: boolean
  cancel: boolean
}

export interface ProviderOrderStatus {
  order: number
  charge?: number
  startCount?: number
  status?: string
  remains?: number
  currency?: string
  error?: string
}

export interface ProviderRefillStatus {
  refill: number
  status?: string
  error?: string
}

export interface ProviderCancelResult {
  order: number
  cancel: number | { error: string }
}

export interface ProviderBalance {
  balance: number
  currency: string
}

/** Validated payload used to place an order at the provider. */
export interface CreateOrderInput {
  /** Provider service id */
  service: number
  link?: string
  quantity?: number
  runs?: number
  interval?: number
  keywords?: string[]
  comments?: string[]
  usernames?: string[]
  username?: string
  answerNumber?: number
  groups?: string[]
  min?: number
  max?: number
  posts?: number
  oldPosts?: number
  delay?: number
  expiry?: string
  country?: string
  device?: number
  typeOfTraffic?: number
  googleKeyword?: string
  referringUrl?: string
}

export interface SmmProvider {
  readonly name: string
  getServices(): Promise<ProviderService[]>
  createOrder(input: CreateOrderInput): Promise<{ order: number }>
  getOrderStatus(orderId: number): Promise<ProviderOrderStatus>
  getOrdersStatus(orderIds: number[]): Promise<Record<string, ProviderOrderStatus>>
  createRefill(orderId: number): Promise<{ refill: number }>
  createRefills(orderIds: number[]): Promise<Array<{ order: number; refill: number | { error: string } }>>
  getRefillStatus(refillId: number): Promise<ProviderRefillStatus>
  getRefillsStatus(refillIds: number[]): Promise<ProviderRefillStatus[]>
  cancelOrders(orderIds: number[]): Promise<ProviderCancelResult[]>
  getBalance(): Promise<ProviderBalance>
}
