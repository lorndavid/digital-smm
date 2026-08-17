import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose'
import { PAYMENT_PROVIDERS, PAYMENT_PURPOSES, PAYMENT_STATUSES } from '../types/index.js'

const paymentSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    /** Order this payment settles (null for wallet top-ups). */
    order: { type: Schema.Types.ObjectId, ref: 'Order', default: null, index: true },
    provider: { type: String, enum: [...PAYMENT_PROVIDERS], default: 'mock' },
    method: { type: String, default: 'KHQR' },
    purpose: { type: String, enum: [...PAYMENT_PURPOSES], default: 'order' },
    status: { type: String, enum: [...PAYMENT_STATUSES], default: 'pending', index: true },
    /** Our unique internal reference, e.g. "PAY-<uuid>". Serves as the idempotency key. */
    referenceId: { type: String, required: true, unique: true },
    /** Provider-side payment id returned by createPayment (CutLuy payment.id). */
    providerPaymentId: { type: String, default: '' },
    /** Idempotency key sent to the provider (mirrors referenceId). */
    idempotencyKey: { type: String, default: '' },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'USD' },
    /** Raw KHQR (EMV) payload from the provider. */
    qrString: { type: String, default: '' },
    /** QR rendered as a data URL (computed server side). */
    qrCodeDataUrl: { type: String, default: '' },
    /** Hosted branded checkout page URL. */
    checkoutUrl: { type: String, default: '' },
    metadata: { type: Schema.Types.Mixed, default: {} },
    approvedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true },
)

export type Payment = InferSchemaType<typeof paymentSchema>
export type PaymentDoc = HydratedDocument<Payment>

// Analytics + status queries: paid revenue by approved date, and the admin
// payments list filtered by status + created date.
paymentSchema.index({ status: 1, approvedAt: -1 })
paymentSchema.index({ status: 1, createdAt: -1 })
paymentSchema.index({ user: 1, createdAt: -1 })

paymentSchema.index({ user: 1, status: 1 })

// Provider lookups (webhook idempotency) — exact matches, high traffic.
paymentSchema.index({ providerPaymentId: 1 })
paymentSchema.index({ order: 1, status: 1 })

export const PaymentModel = model('Payment', paymentSchema)
