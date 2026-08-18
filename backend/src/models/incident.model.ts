import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose'
import { INCIDENT_SEVERITIES, INCIDENT_STATUSES } from '../modules/notifications/index.js'

const incidentSchema = new Schema(
  {
    /** Dedup identity: `service:event` — repeated identical failures update one incident. */
    key: { type: String, required: true, index: true },
    severity: { type: String, enum: INCIDENT_SEVERITIES, default: 'error' },
    service: { type: String, required: true },
    title: { type: String, required: true },
    message: { type: String, default: '' },
    status: { type: String, enum: INCIDENT_STATUSES, default: 'open' },
    occurrences: { type: Number, default: 1 },
    environment: { type: String, default: '' },
    version: { type: String, default: '' },
    firstSeenAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
    resolvedAt: { type: Date, default: null },
    resolutionReason: { type: String, default: '' },
  },
  { timestamps: true },
)

incidentSchema.index({ status: 1, lastSeenAt: -1 })
incidentSchema.index({ key: 1, status: 1 })

export type Incident = InferSchemaType<typeof incidentSchema>
export type IncidentDoc = HydratedDocument<Incident>

export const IncidentModel = model('Incident', incidentSchema)
