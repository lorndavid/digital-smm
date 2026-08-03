import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose'

const webhookLogSchema = new Schema(
  {
    provider: { type: String, required: true, index: true },
    /** Provider event id (dedupe / replay detection). */
    eventId: { type: String, default: '' },
    /** Provider event type, e.g. "payment.completed". */
    type: { type: String, default: '' },
    /** Whether the signature/hash check passed. */
    signatureValid: { type: Boolean, default: false },
    /** The full raw payload received. */
    payload: { type: Schema.Types.Mixed, default: {} },
    /** Outcome of processing (acknowledged / ignored / error). */
    outcome: { type: String, default: '' },
    error: { type: String, default: '' },
    processedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

webhookLogSchema.index({ provider: 1, eventId: 1 })

export type WebhookLog = InferSchemaType<typeof webhookLogSchema>
export type WebhookLogDoc = HydratedDocument<WebhookLog>

export const WebhookLogModel = model('WebhookLog', webhookLogSchema)
