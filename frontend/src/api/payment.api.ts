import { apiClient } from './client'
import type { Order, Paginated, Payment } from '@/types/models'

export interface CreatePaymentInput {
  purpose: 'topup' | 'order'
  amount?: number
  serviceId?: string
  orderId?: string
  link?: string
  quantity?: number
  params?: Record<string, unknown>
}

export interface PaymentStatusResponse {
  payment: Payment
  order: Order | null
}

/** Authenticated payment endpoints (CutLuy / Bakong KHQR). */
export const paymentApi = {
  /** Creates a local order (order purpose) + payment and asks the provider. */
  async create(input: CreatePaymentInput): Promise<PaymentStatusResponse> {
    const { data } = await apiClient.post<PaymentStatusResponse>('/payment/create', input)
    return data
  },

  /** Lightweight status read (payment page load + polling). */
  async status(reference: string): Promise<PaymentStatusResponse> {
    const { data } = await apiClient.get<PaymentStatusResponse>('/payment/status', {
      params: { reference },
    })
    return data
  },

  /** Forces a provider check; settles the payment when paid. */
  async verify(reference: string): Promise<PaymentStatusResponse> {
    const { data } = await apiClient.post<PaymentStatusResponse>('/payment/verify', { reference })
    return data
  },

  /** Cancels a pending payment (and its pending order). */
  async cancel(reference: string): Promise<PaymentStatusResponse> {
    const { data } = await apiClient.post<PaymentStatusResponse>('/payment/cancel', { reference })
    return data
  },

  /** Generates a fresh QR for an existing pending order. */
  async retry(orderId: string): Promise<PaymentStatusResponse> {
    const { data } = await apiClient.post<PaymentStatusResponse>('/payment/retry', { orderId })
    return data
  },

  async history(params: { page?: number; limit?: number } = {}): Promise<Paginated<Payment>> {
    const { data } = await apiClient.get<Paginated<Payment>>('/payment/history', { params })
    return data
  },
}
