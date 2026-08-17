/**
 * In-memory request metrics store.
 *
 * Tracks per-route request counts, error counts and latency percentiles
 * (p50/p95/p99) in a sliding window. No sensitive data is stored — only
 * method, route template, status and duration.
 *
 * Data lives in memory per instance; when running multiple replicas each
 * instance reports its own view (the admin health page can aggregate via
 * Redis later). The window is kept small (5 minutes) to bound memory.
 */

export interface RouteMetrics {
  method: string
  route: string
  count: number
  errorCount: number
  /** Latency in ms. */
  lastDurationMs: number
  /** Rolling sums for percentile computation. */
  durationsMs: number[]
  lastErrorAt: string | null
  lastErrorRoute: string | null
}

export interface MetricsSnapshot {
  startedAt: string
  windowMs: number
  totalRequests: number
  totalErrors: number
  errorRate: number
  routes: RouteMetrics[]
  uptimeSeconds: number
  /** Rolling global latency samples (bounded). */
  globalDurationsMs: number[]
}

const WINDOW_MS = 5 * 60 * 1000
const MAX_SAMPLES_PER_ROUTE = 500

class MetricsStore {
  private readonly routes = new Map<string, RouteMetrics>()
  private readonly startedAt = Date.now()
  private windowStart = Date.now()
  private readonly globalDurations: number[] = []

  private key(method: string, route: string): string {
    return `${method} ${route}`
  }

  /** Records one request outcome. */
  record(method: string, route: string, status: number, durationMs: number): void {
    this.rollWindow()
    const k = this.key(method, route)
    let entry = this.routes.get(k)
    if (!entry) {
      entry = {
        method,
        route,
        count: 0,
        errorCount: 0,
        lastDurationMs: durationMs,
        durationsMs: [],
        lastErrorAt: null,
        lastErrorRoute: null,
      }
      this.routes.set(k, entry)
    }

    entry.count += 1
    entry.lastDurationMs = durationMs
    entry.durationsMs.push(durationMs)
    if (entry.durationsMs.length > MAX_SAMPLES_PER_ROUTE) entry.durationsMs.shift()

    if (status >= 500) {
      entry.errorCount += 1
      entry.lastErrorAt = new Date().toISOString()
      entry.lastErrorRoute = route
    }

    this.globalDurations.push(durationMs)
    if (this.globalDurations.length > MAX_SAMPLES_PER_ROUTE * 4) this.globalDurations.shift()
  }

  /** Drops samples older than the window (cheap bounded roll). */
  private rollWindow(): void {
    if (Date.now() - this.windowStart < WINDOW_MS) return
    this.windowStart = Date.now()
    for (const entry of this.routes.values()) {
      // Keep only recent samples (approximation: drop half the samples).
      const keep = Math.floor(entry.durationsMs.length / 2)
      entry.durationsMs = entry.durationsMs.slice(keep)
      entry.count = Math.max(0, Math.floor(entry.count / 2))
      entry.errorCount = Math.max(0, Math.floor(entry.errorCount / 2))
    }
    this.globalDurations.length = Math.floor(this.globalDurations.length / 2)
  }

  /** Percentile of a sorted sample array (0..100). */
  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
    return Math.round(sorted[index] ?? 0)
  }

  /** Returns a snapshot with per-route metrics + global percentiles. */
  snapshot(): MetricsSnapshot {
    this.rollWindow()
    const routes: RouteMetrics[] = []
    let totalRequests = 0
    let totalErrors = 0

    for (const entry of this.routes.values()) {
      routes.push({
        ...entry,
        durationsMs: [],
        count: entry.count,
        errorCount: entry.errorCount,
      })
      totalRequests += entry.count
      totalErrors += entry.errorCount
    }

    const sorted = [...this.globalDurations].sort((a, b) => a - b)

    return {
      startedAt: new Date(this.startedAt).toISOString(),
      windowMs: WINDOW_MS,
      totalRequests,
      totalErrors,
      errorRate: totalRequests > 0 ? totalErrors / totalRequests : 0,
      routes,
      uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000),
      globalDurationsMs: sorted,
    }
  }

  /** Compact summary with latency percentiles — used by health endpoints. */
  summary() {
    const snap = this.snapshot()
    const sorted = snap.globalDurationsMs
    return {
      startedAt: snap.startedAt,
      uptimeSeconds: snap.uptimeSeconds,
      totalRequests: snap.totalRequests,
      totalErrors: snap.totalErrors,
      errorRate: Math.round(snap.errorRate * 10000) / 10000,
      latency: {
        p50: this.percentile(sorted, 50),
        p95: this.percentile(sorted, 95),
        p99: this.percentile(sorted, 99),
      },
      topRoutes: snap.routes
        .slice()
        .sort((a, b) => b.count - a.count)
        .slice(0, 15),
    }
  }
}

export const metricsStore = new MetricsStore()
