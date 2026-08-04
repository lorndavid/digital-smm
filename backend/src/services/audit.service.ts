import { AuditLogModel } from '../models/audit-log.model.js'

export interface AuditEntry {
  actorId: string
  actorEmail?: string
  action: 'admin.create' | 'admin.set_role' | 'admin.remove_role'
  targetId?: string | null
  targetEmail?: string
  details?: Record<string, unknown>
}

/** Persist a sensitive admin action for the audit trail. */
export async function logAdminAction(entry: AuditEntry): Promise<void> {
  try {
    await AuditLogModel.create({
      actorId: entry.actorId,
      actorEmail: entry.actorEmail ?? '',
      action: entry.action,
      targetId: entry.targetId ?? null,
      targetEmail: entry.targetEmail ?? '',
      details: entry.details ?? {},
    })
  } catch (err) {
    // Audit logging must never break the primary admin operation.
    // eslint-disable-next-line no-console
    console.error('[audit] failed to persist audit log', err)
  }
}

/** List recent audit entries (most recent first). */
export async function listAuditLogs(params: {
  page: number
  limit: number
}): Promise<{ items: unknown[]; total: number }> {
  const skip = (params.page - 1) * params.limit
  const [items, total] = await Promise.all([
    AuditLogModel.find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(params.limit)
      .lean()
      .exec(),
    AuditLogModel.countDocuments({}).exec(),
  ])
  return { items, total }
}
