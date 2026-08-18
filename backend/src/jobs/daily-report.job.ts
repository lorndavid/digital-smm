import { randomUUID } from 'node:crypto'
import { env } from '../config/env.js'
import { isDatabaseConnected } from '../config/database.js'
import { logger } from '../utils/logger.js'
import { getAppVersion } from '../utils/version.js'
import { metricsStore } from '../services/monitoring/metrics.store.js'
import { latestDeployments } from '../services/monitoring/deployment.service.js'
import type { Deployment } from '../models/deployment.model.js'
import { countOpenIncidents } from '../services/monitoring/incident.service.js'
import { telegram, formatKhTime } from '../modules/notifications/index.js'
import { tryAcquireLock, releaseLock } from '../utils/distributed-lock.js'
import { OrderModel } from '../models/order.model.js'
import { PaymentModel } from '../models/payment.model.js'

/**
 * Daily operational report — every day at DAILY_REPORT_TIME (default 22:00)
 * in DAILY_REPORT_TZ (default Asia/Phnom_Penh) via Telegram.
 *
 * - TIMEZONE-SAFE: the target time is resolved in the configured zone, never
 *   the server's local time.
 * - SINGLE-OWNER: a Mongo distributed lock guarantees exactly one report per
 *   day even with multiple backend replicas.
 * - FAIL-SAFE: report failures are logged and bounded-retried (the next
 *   tick within the same minute retries once); Telegram delivery failures
 *   are logged, never retried forever.
 */

const TICK_MS = 30_000
const LOCK_TTL_MS = 10 * 60 * 1000

const instanceId = randomUUID()
let timer: NodeJS.Timeout | null = null
let lastReportedDay = ''

/** Start of the current calendar day in `tz` (as a UTC Date for Mongo queries). */
export function startOfTodayInTz(tz: string): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value ?? 0)
  return new Date(Date.UTC(get('year'), get('month') - 1, get('day')))
}

/** Current HH:mm wall-clock in `tz` (e.g. '22:00'). */
export function currentTimeInTz(tz: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date())
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? '00'
  return `${get('hour')}:${get('minute')}`
}

/** Calendar day in `tz` (YYYY-MM-DD) — used to ensure one report per day. */
export function dayKeyInTz(tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

export interface DailyReportData {
  environment: string
  version: string
  commit: string
  dbConnected: boolean
  smmProvider: string
  paymentProvider: string
  uptimeSeconds: number
  requests: number
  errors: number
  errorRate: number
  latency: { p50: number; p95: number; p99: number }
  ordersToday: number
  paymentsToday: Record<string, number>
  revenueTodayUsd: number
  openIncidents: number
  deployments: Record<'frontend' | 'admin' | 'backend', Deployment | null>
}

/** Gathers every data point for the report. Never throws. */
export async function gatherDailyReportData(): Promise<DailyReportData> {
  const metrics = metricsStore.summary()
  const app = getAppVersion()
  const start = startOfTodayInTz(env.DAILY_REPORT_TZ)

  const [ordersToday, paymentGroups, revenue, openIncidents, deployments] = await Promise.all([
    OrderModel.countDocuments({ createdAt: { $gte: start } }).exec().catch(() => 0),
    PaymentModel.aggregate<{ _id: string; n: number }>([
      { $match: { createdAt: { $gte: start } } },
      { $group: { _id: '$status', n: { $sum: 1 } } },
    ])
      .exec()
      .catch(() => []),
    PaymentModel.aggregate<{ total: number }>([
      { $match: { status: 'paid', createdAt: { $gte: start } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ])
      .exec()
      .catch(() => []),
    countOpenIncidents(),
    latestDeployments().catch(() => ({ frontend: null, admin: null, backend: null })),
  ])

  const paymentsToday: Record<string, number> = {}
  for (const g of paymentGroups) paymentsToday[g._id] = g.n

  return {
    environment: app.environment,
    version: app.version,
    commit: app.commit,
    dbConnected: isDatabaseConnected(),
    smmProvider: env.SMM_PROVIDER,
    paymentProvider: env.PAYMENT_PROVIDER,
    uptimeSeconds: metrics.uptimeSeconds,
    requests: metrics.totalRequests,
    errors: metrics.totalErrors,
    errorRate: metrics.errorRate,
    latency: metrics.latency,
    ordersToday,
    paymentsToday,
    revenueTodayUsd: Math.round((revenue[0]?.total ?? 0) * 100) / 100,
    openIncidents,
    deployments,
  }
}

/** Builds the report text from gathered data. Pure, testable. */
export function buildDailyReport(data: DailyReportData): string[] {
  const statusIcon = (ok: boolean): string => (ok ? '🟢' : '🔴')
  const lines = [
    `📊 DigitalSMM Daily System Report`,
    ``,
    `Date: ${formatKhTime()}`,
    `Environment: ${data.environment}`,
    ``,
    `SYSTEM`,
    `${statusIcon(true)} API`,
    `${statusIcon(data.dbConnected)} MongoDB`,
    `SMM provider: ${data.smmProvider}`,
    `Payment provider: ${data.paymentProvider}`,
    ``,
    `DEPLOYMENTS`,
  ]

  for (const service of ['frontend', 'admin', 'backend'] as const) {
    const d = data.deployments[service]
    if (d) {
      lines.push(`${service}: ${d.status.toUpperCase()} (${d.version}${d.commit ? ` @ ${d.commit.slice(0, 7)}` : ''})`)
    } else {
      lines.push(`${service}: —`)
    }
  }

  lines.push(
    ``,
    `TRAFFIC (5 min window)`,
    `Requests: ${data.requests}`,
    `Errors: ${data.errors}`,
    `Error rate: ${(data.errorRate * 100).toFixed(2)}%`,
    ``,
    `PERFORMANCE`,
    `p50: ${data.latency.p50}ms · p95: ${data.latency.p95}ms · p99: ${data.latency.p99}ms`,
    ``,
    `BUSINESS (today)`,
    `Orders: ${data.ordersToday}`,
    `Revenue: $${data.revenueTodayUsd.toFixed(2)}`,
    `Payments: ${Object.entries(data.paymentsToday)
      .map(([k, v]) => `${k}: ${v}`)
      .join(' · ')}`,
    ``,
    `INCIDENTS`,
    `Open: ${data.openIncidents}`,
    ``,
    `UPTIME`,
    `${Math.floor(data.uptimeSeconds / 3600)}h ${Math.floor((data.uptimeSeconds % 3600) / 60)}m`,
    ``,
    `SYSTEM STATUS`,
    data.openIncidents > 0 || data.errors > 0 ? `🟠 DEGRADED` : `🟢 HEALTHY`,
  )
  return lines
}

/** Generates and sends the report. Returns true when delivered. */
export async function runDailyReport(): Promise<boolean> {
  try {
    const data = await gatherDailyReportData()
    const ok = await telegram.sendReport(buildDailyReport(data))
    if (ok) {
      logger.info('[job] daily report sent')
    } else {
      logger.warn('[job] daily report not delivered (telegram disabled or failed)')
    }
    return ok
  } catch (err) {
    logger.error('[job] daily report failed', { error: err instanceof Error ? err.message : String(err) })
    return false
  }
}

/** Ticks every 30s; fires the report once per day at the configured time. */
async function tick(): Promise<void> {
  try {
    if (!env.DAILY_REPORT_ENABLED) return
    if (env.DAILY_REPORT_TIME !== currentTimeInTz(env.DAILY_REPORT_TZ)) return

    const day = dayKeyInTz(env.DAILY_REPORT_TZ)
    if (day === lastReportedDay) return

    const lockName = `daily-report:${day}`
    const acquired = await tryAcquireLock(lockName, LOCK_TTL_MS, instanceId)
    if (!acquired) return // another replica is (or already did) report today

    const ok = await runDailyReport()
    await releaseLock(lockName, instanceId)
    // Only mark the day as done on success or after the bounded retries in
    // this minute — a failed report retries on the next tick (≤30s).
    if (ok) lastReportedDay = day
  } catch (err) {
    logger.error('[job] daily-report tick failed', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

export function startDailyReportJob(): void {
  if (timer) return
  timer = setInterval(() => void tick(), TICK_MS)
  logger.info(`[job] daily report scheduled at ${env.DAILY_REPORT_TIME} (${env.DAILY_REPORT_TZ})`)
}

export function stopDailyReportJob(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
