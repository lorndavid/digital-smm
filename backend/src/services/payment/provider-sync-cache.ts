/**
 * Per-payment provider status sync throttle.
 *
 * Every payment page polls roughly every 3s; without a throttle, 100 users
 * waiting on KHQRs would translate to ~20–33 CutLuy API calls per second.
 * This tiny cache guarantees each pending payment is checked against the
 * provider at most once per TTL. Instant pushes still arrive via the
 * webhook → SSE path, so the TTL only delays the (no-webhook) polling
 * fallback by a few seconds.
 *
 * Only SUCCESSFUL provider checks are recorded — a transient provider
 * error is never throttled, so recovery is immediate on the next poll.
 *
 * In-memory per-process; idempotent reads make it safe across instances
 * (a shorter effective TTL just means a few extra provider GETs).
 */

const DEFAULT_TTL_MS = 10_000

export interface ProviderSyncCache {
  /** True when a provider check is due for this payment (not throttled). */
  isDue(paymentId: string): boolean
  /** Records a successful provider check for this payment. */
  markSynced(paymentId: string): void
}

export function createProviderSyncCache(ttlMs = DEFAULT_TTL_MS): ProviderSyncCache {
  const syncedAt = new Map<string, number>()
  let writes = 0

  // Amortized cleanup: every ~512 writes, drop entries older than the TTL so
  // abandoned payments never leak memory on a busy box.
  const prune = (now: number): void => {
    const cutoff = now - ttlMs
    for (const [id, at] of syncedAt) {
      if (at < cutoff) syncedAt.delete(id)
    }
  }

  return {
    isDue(paymentId) {
      const last = syncedAt.get(paymentId)
      return last === undefined || Date.now() - last >= ttlMs
    },
    markSynced(paymentId) {
      if (writes++ % 512 === 0) prune(Date.now())
      syncedAt.set(paymentId, Date.now())
    },
  }
}

/** Shared instance used by the payment service. */
export const providerSyncCache = createProviderSyncCache()
