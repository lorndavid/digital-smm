import { defineStore } from 'pinia'
import { ref } from 'vue'
import { ordersApi, type CreateOrderInput } from '@/api/orders.api'
import { ApiRequestError } from '@/api/client'
import type { Order } from '@/types/models'

export const useOrdersStore = defineStore('orders', () => {
  const orders = ref<Order[]>([])
  const total = ref(0)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const message = (err: unknown, fallback: string) =>
    err instanceof ApiRequestError ? err.message : fallback

  async function fetchOrders(
    params: { page?: number; limit?: number; status?: string } = {},
    /** Silent background refresh — no skeleton flash. */
    silent = false,
  ) {
    if (!silent) loading.value = true
    error.value = null
    try {
      const result = await ordersApi.list(params)
      orders.value = result.items
      total.value = result.total
    } catch (err) {
      error.value = message(err, 'Failed to load orders')
    } finally {
      loading.value = false
    }
  }

  async function placeOrder(input: CreateOrderInput): Promise<Order> {
    const order = await ordersApi.create(input)
    orders.value.unshift(order)
    return order
  }

  async function cancelOrder(id: string): Promise<Order> {
    const order = await ordersApi.cancel(id)
    const index = orders.value.findIndex((o) => o._id === id)
    if (index !== -1) orders.value[index] = order
    return order
  }

  return { orders, total, loading, error, fetchOrders, placeOrder, cancelOrder }
})
