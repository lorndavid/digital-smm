import { onUnmounted, ref } from 'vue'
import { getAuthToken } from '@/api/session'

export interface OrderLiveEvent {
  type: 'hello' | 'order'
  userId?: string
  orderId?: string
  orderNumber?: number | null
  status?: string
  remains?: number
  startCount?: number
  charge?: number
  providerOrderId?: number | null
  updatedAt?: string
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'

/** Reconnect delay after a dropped stream. */
const RECONNECT_MS = 5000
/**
 * Give up reconnecting after this many consecutive failures — the views'
 * 5s polling is the always-on safety net that keeps statuses fresh, so a
 * permanently dead SSE stream degrades to polling instead of a busy loop.
 */
const MAX_RETRIES = 6

/**
 * Streams order status updates over Server-Sent Events using fetch()
 * (so the Authorization header is attached). One stream per signed-in user —
 * the backend keys events by user id, so this single connection pushes
 * updates for every order on the page.
 *
 * The views keep their existing 5s polling as a safety net (same pattern as
 * the payment SSE), so a stalled or dropped stream never leaves statuses
 * stale: worst case the next poll picks the change up.
 *
 * `start()` is idempotent — safe to call again after a reconnect.
 */
export function useOrderEvents(onEvent: (event: OrderLiveEvent) => void) {
  const connected = ref(false)

  let controller: AbortController | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let stopped = false
  let session = 0
  let retries = 0

  async function openStream(mySession: number): Promise<void> {
    if (stopped || mySession !== session) return

    const myController = new AbortController()
    controller = myController
    try {
      const res = await fetch(`${API_BASE}/orders/events`, {
        headers: { Authorization: `Bearer ${getAuthToken() ?? ''}` },
        signal: myController.signal,
        // An SSE stream must never be served from the browser cache.
        cache: 'no-store',
      })

      if (!res.ok || !res.body) throw new Error('SSE unavailable')

      connected.value = true
      retries = 0

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      const read = async (): Promise<void> => {
        try {
          const { done, value } = await reader.read()
          if (done) throw new Error('stream closed')
          buffer += decoder.decode(value, { stream: true })
          const events = buffer.split('\n\n')
          buffer = events.pop() ?? ''
          for (const chunk of events) {
            const line = chunk.split('\n').find((l) => l.startsWith('data: '))
            if (!line) continue
            const payload = JSON.parse(line.slice(6)) as OrderLiveEvent
            onEvent(payload)
          }
          if (!stopped && mySession === session) void read()
        } catch {
          if (!stopped && mySession === session) scheduleReconnect()
        }
      }
      void read()
    } catch {
      if (!stopped && mySession === session) scheduleReconnect()
    }
  }

  function scheduleReconnect(): void {
    connected.value = false
    if (stopped) return
    retries += 1
    // Polling is the safety net — never reconnect forever.
    if (retries > MAX_RETRIES) return
    if (reconnectTimer) clearTimeout(reconnectTimer)
    reconnectTimer = setTimeout(() => {
      if (!stopped) void openStream(session)
    }, RECONNECT_MS)
  }

  /** Opens (or reopens) the live stream. Idempotent. */
  function start(): void {
    session += 1
    controller?.abort()
    stopped = false
    retries = 0
    connected.value = false
    void openStream(session)
  }

  function stop(): void {
    stopped = true
    session += 1
    controller?.abort()
    if (reconnectTimer) clearTimeout(reconnectTimer)
    reconnectTimer = null
    connected.value = false
  }

  onUnmounted(stop)

  return { connected, start, stop }
}
