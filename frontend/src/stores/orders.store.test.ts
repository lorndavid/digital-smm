import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useOrdersStore } from './orders.store'
import { setConsent } from '@/analytics/consent'
import type { Order } from '@/types/models'

// Minimal browser globals (mirrors analytics/events.test.ts).
;(globalThis as unknown as { window?: unknown }).window = globalThis
const win = globalThis as unknown as { dataLayer?: unknown[]; localStorage?: Storage }
win.dataLayer = []
const storage = new Map<string, string>()
win.localStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => void storage.set(key, value),
  removeItem: (key: string) => void storage.delete(key),
  clear: () => storage.clear(),
  key: (index: number) => [...storage.keys()][index] ?? null,
  get length() {
    return storage.size
  },
} as Storage

function pushedEvents(): Array<{ event?: string }> {
  return (win.dataLayer ?? []) as Array<{ event?: string }>
}

function order(overrides: Partial<Order> = {}): Order {
  return {
    _id: 'order_1',
    orderNumber: 1001,
    status: 'Processing',
    service: 'svc_123',
    quantity: 1000,
    totalPrice: 4.2,
    currency: 'USD',
    link: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as Order
}

beforeEach(() => {
  vi.stubEnv('VITE_APP_ENV', 'development')
  vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TEST123')
  win.dataLayer = []
  setConsent('granted')
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('orders store — backend-verified status transitions', () => {
  it('fires order_complete once when an order transitions to Completed', () => {
    const store = useOrdersStore()
    store.orders.push(order({ status: 'Processing' }))

    store.applyOrderUpdate({ _id: 'order_1', status: 'Completed' })
    let events = pushedEvents()
    expect(events).toHaveLength(1)
    expect(events[0].event).toBe('order_complete')

    // Same status again (SSE duplicate) — no second event.
    store.applyOrderUpdate({ _id: 'order_1', status: 'Completed' })
    events = pushedEvents()
    expect(events).toHaveLength(1)
  })

  it('fires refund once when an order transitions to Refunded', () => {
    const store = useOrdersStore()
    store.orders.push(order({ status: 'Processing' }))

    store.applyOrderUpdate({ _id: 'order_1', status: 'Refunded' })
    let events = pushedEvents()
    expect(events).toHaveLength(1)
    expect(events[0].event).toBe('refund')

    store.applyOrderUpdate({ _id: 'order_1', status: 'Refunded' })
    events = pushedEvents()
    expect(events).toHaveLength(1)
  })

  it('fires no events for non-terminal transitions or partial updates', () => {
    const store = useOrdersStore()
    store.orders.push(order({ status: 'Processing' }))

    store.applyOrderUpdate({ _id: 'order_1', remains: 500 })
    store.applyOrderUpdate({ _id: 'order_1', status: 'Partial' })
    expect(pushedEvents()).toHaveLength(0)
  })

  it('does not fire for orders that are not on the current page', () => {
    const store = useOrdersStore()
    store.orders.push(order({ _id: 'order_1', status: 'Processing' }))

    const result = store.applyOrderUpdate({ _id: 'order_2', status: 'Completed' })
    expect(result).toBeNull()
    expect(pushedEvents()).toHaveLength(0)
  })
})
