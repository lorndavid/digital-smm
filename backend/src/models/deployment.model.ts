import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose'

export const DEPLOYMENT_SERVICES = ['frontend', 'admin', 'backend'] as const
export const DEPLOYMENT_STATUSES = ['in-progress', 'success', 'failed', 'rolled-back'] as const

const deploymentSchema = new Schema(
  {
    deploymentId: { type: String, default: '' },
    service: { type: String, enum: DEPLOYMENT_SERVICES, required: true, index: true },
    version: { type: String, default: '' },
    commit: { type: String, default: '' },
    environment: { type: String, default: 'production' },
    status: { type: String, enum: DEPLOYMENT_STATUSES, default: 'in-progress' },
    triggeredBy: { type: String, default: 'ci' },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
    durationMs: { type: Number, default: 0 },
    rollbackTo: { type: String, default: '' },
    url: { type: String, default: '' },
    notes: { type: String, default: '' },
  },
  { timestamps: true },
)

deploymentSchema.index({ service: 1, startedAt: -1 })

export type Deployment = InferSchemaType<typeof deploymentSchema>
export type DeploymentDoc = HydratedDocument<Deployment>

export const DeploymentModel = model('Deployment', deploymentSchema)
