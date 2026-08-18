import { IncidentModel } from '../../models/incident.model.js'
import type { IncidentSeverity, IncidentStatus } from '../../modules/notifications/index.js'
import { logger } from '../../utils/logger.js'

/**
 * Incident service — persists operational incidents so the admin panel can
 * show open/current issues and the daily report can count them.
 *
 * Deduplication: the same `key` (service:event) while an incident is open or
 * investigating increments occurrences on ONE document instead of creating
 * thousands. When it resolves, a later recurrence starts a fresh incident.
 *
 * NEVER write secrets or customer data into incidents.
 */

export interface ReportIncidentInput {
  key: string
  severity: IncidentSeverity
  service: string
  title: string
  message?: string
  environment?: string
  version?: string
}

/** Records or updates an open incident for `key`. Never throws. */
export async function reportIncident(input: ReportIncidentInput): Promise<void> {
  try {
    const open = await IncidentModel.findOne({
      key: input.key,
      status: { $in: ['open', 'investigating'] },
    }).exec()

    if (open) {
      open.occurrences += 1
      open.lastSeenAt = new Date()
      open.severity = open.severity === 'critical' || input.severity === 'critical' ? 'critical' : input.severity
      if (input.message) open.message = input.message.slice(0, 2000)
      await open.save()
      return
    }

    await IncidentModel.create({
      key: input.key,
      severity: input.severity,
      service: input.service,
      title: input.title,
      message: (input.message ?? '').slice(0, 2000),
      status: 'open',
      occurrences: 1,
      environment: input.environment ?? '',
      version: input.version ?? '',
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    })
  } catch (err) {
    // Incidents are operational metadata — a DB hiccup must not crash callers.
    logger.warn('[incident] failed to record incident', {
      error: err instanceof Error ? err.message : String(err),
      key: input.key,
    })
  }
}

/** Marks all open/investigating incidents with `key` as resolved. */
export async function resolveIncidentByKey(key: string, reason: string): Promise<void> {
  try {
    await IncidentModel.updateMany(
      { key, status: { $in: ['open', 'investigating'] } },
      {
        $set: {
          status: 'resolved' as IncidentStatus,
          resolvedAt: new Date(),
          resolutionReason: reason.slice(0, 500),
        },
      },
    ).exec()
  } catch (err) {
    logger.warn('[incident] failed to resolve incidents', {
      error: err instanceof Error ? err.message : String(err),
      key,
    })
  }
}

/** Marks a single incident resolved by id. */
export async function resolveIncidentById(id: string, reason: string): Promise<boolean> {
  try {
    const res = await IncidentModel.updateOne(
      { _id: id, status: { $in: ['open', 'investigating'] } },
      {
        $set: {
          status: 'resolved' as IncidentStatus,
          resolvedAt: new Date(),
          resolutionReason: reason.slice(0, 500),
        },
      },
    ).exec()
    return res.modifiedCount > 0
  } catch (err) {
    logger.warn('[incident] failed to resolve incident by id', {
      error: err instanceof Error ? err.message : String(err),
      id,
    })
    return false
  }
}

export interface IncidentFilter {
  status?: string
  severity?: string
  service?: string
  search?: string
  page?: number
  limit?: number
}

export interface IncidentListItem {
  id: string
  key: string
  severity: IncidentSeverity
  service: string
  title: string
  message: string
  status: IncidentStatus
  occurrences: number
  environment: string
  version: string
  firstSeenAt: Date
  lastSeenAt: Date
  resolvedAt: Date | null
  resolutionReason: string
}

/** Lists incidents (newest first) with optional filters. Never throws. */
export async function listIncidents(filter: IncidentFilter = {}): Promise<{ items: IncidentListItem[]; total: number }> {
  try {
    const query: Record<string, unknown> = {}
    if (filter.status) query.status = filter.status
    if (filter.severity) query.severity = filter.severity
    if (filter.service) query.service = filter.service
    if (filter.search) {
      query.$or = [
        { title: { $regex: filter.search, $options: 'i' } },
        { key: { $regex: filter.search, $options: 'i' } },
      ]
    }

    const page = Math.max(1, filter.page ?? 1)
    const limit = Math.min(100, Math.max(1, filter.limit ?? 20))
    const [items, total] = await Promise.all([
      IncidentModel.find(query)
        .sort({ lastSeenAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      IncidentModel.countDocuments(query).exec(),
    ])

    return {
      items: items.map((i) => ({
        id: i._id.toString(),
        key: i.key,
        severity: i.severity as IncidentSeverity,
        service: i.service,
        title: i.title,
        message: i.message,
        status: i.status as IncidentStatus,
        occurrences: i.occurrences,
        environment: i.environment,
        version: i.version,
        firstSeenAt: i.firstSeenAt,
        lastSeenAt: i.lastSeenAt,
        resolvedAt: i.resolvedAt ?? null,
        resolutionReason: i.resolutionReason,
      })),
      total,
    }
  } catch (err) {
    logger.warn('[incident] failed to list incidents', {
      error: err instanceof Error ? err.message : String(err),
    })
    return { items: [], total: 0 }
  }
}

/** Counts open incidents (used by the daily report). */
export async function countOpenIncidents(): Promise<number> {
  try {
    return await IncidentModel.countDocuments({ status: { $in: ['open', 'investigating'] } }).exec()
  } catch {
    return 0
  }
}
