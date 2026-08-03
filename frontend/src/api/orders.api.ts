import { apiClient } from './client'
import type { Order, Paginated } from '@/types/models'

export interface CreateOrderInput {
  serviceId: string
  link?: string
  quantity?: number
  params?: Record<string, unknown>
}

export interface ListOrdersParams {
  page?: number
  limit?: number
  status?: string
}

/** Authenticated order endpoints. */
export const ordersApi = {
  async list(params: ListOrdersParams = {}): Promise<Paginated<Order>> {
    const { data } = await apiClient.get<Paginated<Order>>('/orders', { params })
    return data
  },

  async get(id: string): Promise<Order> {
    const { data } = await apiClient.get<Order>(`/orders/${id}`)
    return data
  },

  /** Places a wallet-funded order. */
  async create(input: CreateOrderInput): Promise<Order> {
    const { data } = await apiClient.post<Order>('/orders', input)
    return data
  },

  async cancel(id: string): Promise<Order> {
    const { data } = await apiClient.post<Order>(`/orders/${id}/cancel`)
    return data
  },

  async refill(id: string): Promise<{ refill: number }> {
    const { data } = await apiClient.post<{ refill: number }>(`/orders/${id}/refill`)
    return data
  },
}
