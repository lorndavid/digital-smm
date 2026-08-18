import { DeploymentModel, type Deployment } from '../../models/deployment.model.js'
import { getAppVersion } from '../../utils/version.js'
import { logger } from '../../utils/logger.js'

/**
 * Deployment tracking — records every deployment so the admin panel and the
 * daily report can show what is running, what happened, and what to roll
 * back to (last known-good version).
 *
 * The backend records its own boot as a deployment (identity baked into the
 * image); CI/CD additionally records frontend/admin/backend outcomes by
 * calling the same service (or via the admin API when a token is available).
 */

export type DeploymentServiceName = 'frontend' | 'admin' | 'backend'
export type DeploymentStatus = 'in-progress' | 'success' | 'failed' | 'rolled-back'

export interface RecordDeploymentInput {
  service: DeploymentServiceName
  status: DeploymentStatus
  version?: string
  commit?: string
  environment?: string
  triggeredBy?: string
  deploymentId?: string
  durationMs?: number
  rollbackTo?: string
  url?: string
  notes?: string
}

/** Records one deployment event. Never throws. */
export async function recordDeployment(input: RecordDeploymentInput): Promise<void> {
  const app = getAppVersion()
  try {
    await DeploymentModel.create({
      service: input.service,
      status: input.status,
      version: input.version ?? app.version,
      commit: input.commit ?? app.commit,
      environment: input.environment ?? app.environment,
      triggeredBy: input.triggeredBy ?? 'ci',
      deploymentId: input.deploymentId ?? '',
      startedAt: new Date(),
      completedAt: input.status === 'in-progress' ? null : new Date(),
      durationMs: input.durationMs ?? 0,
      rollbackTo: input.rollbackTo ?? '',
      url: input.url ?? '',
      notes: input.notes ?? '',
    })
  } catch (err) {
    logger.warn('[deployment] failed to record deployment', {
      error: err instanceof Error ? err.message : String(err),
      service: input.service,
    })
  }
}

/** Records the backend's own boot as a deployment (container start = deploy). */
export async function recordBootDeployment(): Promise<void> {
  await recordDeployment({
    service: 'backend',
    status: 'success',
    triggeredBy: 'boot',
  })
}

/** Latest deployment record per service (fallback: empty placeholder). */
export async function latestDeployments(): Promise<
  Record<DeploymentServiceName, Deployment | null>
> {
  const services: DeploymentServiceName[] = ['frontend', 'admin', 'backend']
  const result: Record<DeploymentServiceName, Deployment | null> = {
    frontend: null,
    admin: null,
    backend: null,
  }
  for (const service of services) {
    result[service] = await DeploymentModel.findOne({ service })
      .sort({ startedAt: -1 })
      .lean()
      .exec()
  }
  return result
}

export interface DeploymentListItem {
  id: string
  service: string
  version: string
  commit: string
  environment: string
  status: string
  triggeredBy: string
  deploymentId: string
  startedAt: Date
  completedAt: Date | null
  durationMs: number
  rollbackTo: string
  url: string
  notes: string
}

/** Lists deployment history (newest first) with an optional service filter. */
export async function listDeployments(params: {
  service?: string
  status?: string
  page?: number
  limit?: number
}): Promise<{ items: DeploymentListItem[]; total: number }> {
  try {
    const query: Record<string, unknown> = {}
    if (params.service) query.service = params.service
    if (params.status) query.status = params.status

    const page = Math.max(1, params.page ?? 1)
    const limit = Math.min(100, Math.max(1, params.limit ?? 20))
    const [items, total] = await Promise.all([
      DeploymentModel.find(query)
        .sort({ startedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      DeploymentModel.countDocuments(query).exec(),
    ])

    return {
      items: items.map((d) => ({
        id: d._id.toString(),
        service: d.service,
        version: d.version,
        commit: d.commit,
        environment: d.environment,
        status: d.status,
        triggeredBy: d.triggeredBy,
        deploymentId: d.deploymentId,
        startedAt: d.startedAt,
        completedAt: d.completedAt ?? null,
        durationMs: d.durationMs,
        rollbackTo: d.rollbackTo,
        url: d.url,
        notes: d.notes,
      })),
      total,
    }
  } catch (err) {
    logger.warn('[deployment] failed to list deployments', {
      error: err instanceof Error ? err.message : String(err),
    })
    return { items: [], total: 0 }
  }
}
