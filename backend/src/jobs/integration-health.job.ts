import { randomUUID } from 'node:crypto'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'
import { tryAcquireLock, releaseLock } from '../utils/distributed-lock.js'
import { INTEGRATION_PROVIDERS, type IntegrationProviderKey } from '../services/integrations/integration.types.js'
import { runHealthProbe } from '../services/integrations/index.js'

/**
 * Background integration health checks — every INTEGRATION_HEALTH_INTERVAL_MS
 * (default 30 min) the backend pings each configured + enabled integration
 * with the lightest possible probe (Telegram getMe, SMM balance). Culture
 * API has no adapter probe yet and is skipped.
 *
 * - SINGLE-OWNER: per-provider Mongo distributed lock so multiple replicas
 *   never hammer a provider API simultaneously.
 * - BEST-EFFORT: failures are logged; the stored status is only updated via
 *   `testConnection` when an admin runs a manual test (this job never
 *   writes to the credential document, so it cannot clobber test history).
 * - FAIL-SAFE: disabled/not-configured providers are skipped entirely.
 */

const LOCK_TTL_MS = 5 * 60 * 1000

const instanceId = randomUUID()
let timer: NodeJS.Timeout | null = null

export async function runIntegrationHealthChecks(): Promise<void> {
  const providers = Object.keys(INTEGRATION_PROVIDERS) as IntegrationProviderKey[]
  for (const provider of providers) {
    try {
      const lockName = `integration-health:${provider}`
      const acquired = await tryAcquireLock(lockName, LOCK_TTL_MS, instanceId)
      if (!acquired) continue // another replica owns this provider's check

      const healthy = await runHealthProbe(provider)
      logger.info('[job] integration health probe', { provider, healthy })
      await releaseLock(lockName, instanceId)
    } catch (err) {
      logger.warn('[job] integration health probe failed', {
        provider,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
}

export function startIntegrationHealthJob(): void {
  if (timer) return
  if (env.ENABLE_INTEGRATION_HEALTH_JOB === false) {
    logger.info('[job] integration health checks disabled (ENABLE_INTEGRATION_HEALTH_JOB=false)')
    return
  }
  const interval = Math.max(60_000, env.INTEGRATION_HEALTH_INTERVAL_MS)
  timer = setInterval(() => void runIntegrationHealthChecks(), interval)
  logger.info(`[job] integration health checks scheduled every ${Math.round(interval / 1000)}s`)
}

export function stopIntegrationHealthJob(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
