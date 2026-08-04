import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose'

const auditLogSchema = new Schema(
  {
    /** Admin id of the actor who performed the action. */
    actorId: { type: String, required: true, index: true },
    actorEmail: { type: String, default: '' },
    /** e.g. 'admin.create' | 'admin.set_role' | 'admin.remove_role' */
    action: { type: String, required: true, index: true },
    /** Admin id of the user the action was performed on (if any). */
    targetId: { type: String, default: null },
    targetEmail: { type: String, default: '' },
    details: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
)

export type AuditLog = InferSchemaType<typeof auditLogSchema>
export type AuditLogDoc = HydratedDocument<AuditLog>

export const AuditLogModel = model('AuditLog', auditLogSchema)
