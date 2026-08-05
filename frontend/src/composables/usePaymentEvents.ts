import { onUnmounted, ref } from 'vue'
import { getAuthToken } from '@/api/session'
import type { PaymentStatusResponse } from '@/api/payment.api'

export interface PaymentLiveEvent {
  referenceId: string
  status: string
  orderId?: string | null
  orderStatus?: string | null
  approvedAt?: string | null
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'

const TERMINAL = ['paid', 'expired', 'failed', 'refunded']

/** Poll cadence. Also the max latency to detect a payment without SSE. */
const POLL_INTERVAL_MS = 3000

/**
 * Streams payment status updates over Server-Sent Events using fetch()
 * (so the Authorization header is attached), with an always-on polling
 * safety net.
 *
 * Why poll even while SSE is connected? A stalled SSE stream (proxy
 * buffering, silent connection drop) would otherwise leave the page stuck
 * on "pending" forever — the exact "I had to refresh to see success"
 * bug. Polling every 3s guarantees the paid state auto-detects within a
 * few seconds regardless of SSE health (worst case capped by the
 * backend's ~10s provider-sync TTL). The backend throttles provider
 * checks per payment, so the extra polls are cheap at 100+ users.
 *
 * `start()` is idempotent — safe to call again after a reference change.
 */
export function usePaymentEvents(
  reference: () => string | null,
  onSnapshot: (snap: PaymentStatusResponse) => void,
  onEvent: (event: PaymentLiveEvent) => void,
) {
  const connected = ref(false)
  const polling = ref(false)
  const error = ref('')

  let controller: AbortController | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let stopped = false
  let session = 0
  let lastSnapshot: PaymentStatusResponse | null = null

  /** Pushes a snapshot only when it actually changed — no wasted renders. */
  function applySnapshot(snap: PaymentStatusResponse): void {
    const prev = lastSnapshot
    lastSnapshot = snap
    const changed =
      !prev ||
      prev.payment.status !== snap.payment.status ||
      prev.payment.referenceId !== snap.payment.referenceId ||
      (prev.payment.approvedAt ?? null) !== (snap.payment.approvedAt ?? null)
    if (changed) {
      onSnapshot(snap)
      if (TERMINAL.includes(snap.payment.status)) stopped = true
    }
  }

  async function fetchSnapshot(): Promise<void> {
    const ref = reference()
    if (!ref || stopped) return
    try {
      const res = await fetch(`${API_BASE}/payment/status?reference=${encodeURIComponent(ref)}`, {
        headers: { Authorization: `Bearer ${getAuthToken() ?? ''}` },
      })
      if (res.ok) {
        applySnapshot((await res.json()) as PaymentStatusResponse)
      }
    } catch {
      /* polling continues; transient errors are non-fatal */
    }
  }

  async function openStream(mySession: number): Promise<void> {
    const ref = reference()
    if (!ref || stopped || mySession !== session) return

    const myController = new AbortController()
    controller = myController
    try {
      const res = await fetch(`${API_BASE}/payment/events?reference=${encodeURIComponent(ref)}`, {
        headers: { Authorization: `Bearer ${getAuthToken() ?? ''}` },
        signal: myController.signal,
      })

      if (!res.ok || !res.body) throw new Error('SSE unavailable')

      connected.value = true
      error.value = ''
      // NOTE: polling deliberately keeps running as a safety net.

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
            const payload = JSON.parse(line.slice(6)) as PaymentLiveEvent | PaymentStatusResponse
            if ('referenceId' in payload && 'status' in payload) {
              onEvent(payload as PaymentLiveEvent)
              if (TERMINAL.includes((payload as PaymentLiveEvent).status)) {
                stopped = true
                stopPolling()
              }
            } else {
              applySnapshot(payload as PaymentStatusResponse)
            }
          }
          if (!stopped && mySession === session) void read()
        } catch {
          if (!stopped && mySession === session) fallbackToPolling()
        }
      }
      void read()
    } catch {
      if (!stopped && mySession === session) fallbackToPolling()
    }
  }

  /** Polling is the always-on safety net — cheap thanks to the backend TTL cache. */
  function startPolling(mySession: number): void {
    if (pollTimer || mySession !== session) return
    polling.value = true
    void fetchSnapshot()
    pollTimer = setInterval(() => {
      if (mySession === session && !stopped) void fetchSnapshot()
    }, POLL_INTERVAL_MS)
  }

  function stopPolling(): void {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
    polling.value = false
  }

  function fallbackToPolling(): void {
    connected.value = false
    error.value = 'Live updates paused — still checking automatically.'
    startPolling(session)
  }

  /** Starts (or restarts) the live stream + polling fallback. Idempotent. */
  async function start(): Promise<void> {
    session += 1
    controller?.abort()
    stopPolling()
    stopped = false
    connected.value = false
    error.value = ''

    await fetchSnapshot()
    if (stopped || session === 0) return
    await openStream(session)
    if (stopped) return
    // Safety net runs regardless of SSE state — a stalled stream can never
    // leave the page stuck on "pending".
    startPolling(session)
  }

  function stop(): void {
    stopped = true
    session += 1
    controller?.abort()
    stopPolling()
  }

  onUnmounted(stop)

  return { connected, polling, error, start, stop }
}
