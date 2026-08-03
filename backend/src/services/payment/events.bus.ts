import { EventEmitter } from 'node:events'

/**
 * In-memory pub/sub bus that pushes payment status changes to connected
 * SSE clients. Webhook handlers and polling fulfilment emit here; the
 * `/api/payment/events` endpoint relays to the browser.
 *
 * NOTE: per-process only. With multiple backend instances, replace this
 * with Redis pub/sub — the rest of the code is unchanged.
 */

export interface PaymentStatusPayload {
  referenceId: string
  status: string
  orderId?: string | null
  orderStatus?: string | null
  approvedAt?: string | null
}

const emitter = new EventEmitter()
emitter.setMaxListeners(0)

function channel(referenceId: string): string {
  return `payment:${referenceId}`
}

/** Publishes a status change for a payment reference. */
export function emitPaymentStatus(payload: PaymentStatusPayload): void {
  emitter.emit(channel(payload.referenceId), payload)
}

/**
 * Subscribes to status changes for a reference. Returns an unsubscribe fn.
 */
export function subscribePaymentStatus(
  referenceId: string,
  listener: (payload: PaymentStatusPayload) => void,
): () => void {
  const ch = channel(referenceId)
  emitter.on(ch, listener)
  return () => emitter.off(ch, listener)
}
