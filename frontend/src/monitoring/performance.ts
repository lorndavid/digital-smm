import { analyticsConfig } from '@/analytics/config'
import { trackEvent } from '@/analytics/events'

/**
 * Browser performance metrics (RUM).
 *
 * Collects LCP, CLS, INP, TTFB and navigation timing via the Performance
 * API and reports them as sanitized analytics events. No personal data is
 * collected — only timing values and generic browser/network signals.
 */

interface WebVitalsReport {
  lcpMs?: number
  cls?: number
  inpMs?: number
  ttfbMs?: number
}

let reported = false

/** Reports the collected vitals once per page load. */
function report(): void {
  if (reported) return
  const vitals = readFromPerformanceEntries()
  if (!vitals.lcpMs && !vitals.cls && !vitals.inpMs && !vitals.ttfbMs) return
  reported = true
  trackEvent('web_vitals', {
    ...(vitals.lcpMs !== undefined ? { lcp: vitals.lcpMs } : {}),
    ...(vitals.cls !== undefined ? { cls: vitals.cls } : {}),
    ...(vitals.inpMs !== undefined ? { inp: vitals.inpMs } : {}),
    ...(vitals.ttfbMs !== undefined ? { ttfb: vitals.ttfbMs } : {}),
  })
}

/** Reads timing values already present in the Performance timeline. */
function readFromPerformanceEntries(): WebVitalsReport {
  const result: WebVitalsReport = {}

  // TTFB — from the navigation timing entry.
  try {
    const nav = performance.getEntriesByType('navigation')[0] as
      | PerformanceNavigationTiming
      | undefined
    if (nav) {
      result.ttfbMs = Math.round(nav.responseStart - nav.requestStart)
    }
  } catch {
    /* unavailable */
  }

  // LCP — from the largest-contentful-paint entry.
  try {
    const lcp = performance.getEntriesByType('largest-contentful-paint').pop() as
      | { startTime?: number }
      | undefined
    if (lcp?.startTime !== undefined) result.lcpMs = Math.round(lcp.startTime)
  } catch {
    /* unavailable */
  }

  // CLS — from layout-shift entries (sum of non-recent shifts).
  try {
    const shifts = performance.getEntriesByType('layout-shift') as Array<{
      hadRecentInput?: boolean
      value?: number
    }>
    let total = 0
    for (const s of shifts) {
      if (!s.hadRecentInput && typeof s.value === 'number') total += s.value
    }
    if (total > 0) result.cls = Math.round(total * 1000) / 1000
  } catch {
    /* unavailable */
  }

  return result
}

/**
 * Attaches observers for LCP / CLS / INP and reports once they settle
 * (or on page hide, whichever comes first). Best-effort and non-blocking.
 */
export function collectWebVitals(): void {
  if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return
  if (!analyticsConfig.enabled) return

  try {
    const vitals: WebVitalsReport = {}

    const reportOnHide = () => report()

    // LCP
    try {
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries()
        const last = entries[entries.length - 1] as { startTime?: number } | undefined
        if (last?.startTime !== undefined) vitals.lcpMs = Math.round(last.startTime)
      })
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true })
    } catch {
      /* unsupported */
    }

    // CLS
    try {
      const clsObserver = new PerformanceObserver((list) => {
        let total = 0
        for (const entry of list.getEntries() as Array<{
          hadRecentInput?: boolean
          value?: number
        }>) {
          if (!entry.hadRecentInput && typeof entry.value === 'number') total += entry.value
        }
        vitals.cls = Math.round(total * 1000) / 1000
      })
      clsObserver.observe({ type: 'layout-shift', buffered: true })
    } catch {
      /* unsupported */
    }

    // INP (event timing)
    try {
      const inpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries() as Array<{ duration?: number }>
        let worst = 0
        for (const entry of entries) {
          if (typeof entry.duration === 'number' && entry.duration > worst) {
            worst = entry.duration
          }
        }
        if (worst > 0) vitals.inpMs = Math.round(worst)
      })
      // `durationThreshold` is a newer spec field missing from some TS libs.
      inpObserver.observe({ type: 'event', buffered: true, durationThreshold: 16 } as never)
    } catch {
      /* unsupported */
    }

    // Fall back to the entries already on the timeline and report on hide.
    const nav = performance.getEntriesByType('navigation')[0] as
      | PerformanceNavigationTiming
      | undefined
    if (nav) vitals.ttfbMs = Math.round(nav.responseStart - nav.requestStart)

    document.addEventListener('visibilitychange', reportOnHide, { once: true })
    // Give INP a few seconds of interaction before the pagehide fallback.
    window.addEventListener('pagehide', reportOnHide, { once: true })
    window.setTimeout(reportOnHide, 5000)
  } catch {
    /* monitoring must never break the app */
  }
}
