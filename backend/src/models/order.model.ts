import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose'
import { ORDER_STATUSES, ServiceType } from '../types/index.js'

const orderSchema = new Schema(
  {
    /** Sequential, human friendly order number (ORD-10001 style). */
    orderNumber: { type: Number, unique: true },
    /** Order id returned by the provider. */
    providerOrderId: { type: Number, default: null, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    service: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
    type: { type: String, enum: Object.values(ServiceType), required: true },
    link: { type: String, default: '' },
    quantity: { type: Number, default: 0 },
    pricePerUnit: { type: Number, default: 0 },
    totalPrice: { type: Number, default: 0 },
    currency: { type: String, default: 'USD' },
    /** Type-specific order parameters (comments, keywords, runs, ...). */
    params: { type: Schema.Types.Mixed, default: {} },
    status: { type: String, enum: [...ORDER_STATUSES], default: 'Processing', index: true },
    startCount: { type: Number, default: 0 },
    remains: { type: Number, default: 0 },
    charge: { type: Number, default: 0 },
    payment: { type: Schema.Types.ObjectId, ref: 'Payment', default: null },
    error: { type: String, default: '' },
    /** Transient claim marker: set while the SMM provider order is being placed. */
    fulfillmentStartedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

export type Order = InferSchemaType<typeof orderSchema>
export type OrderDoc = HydratedDocument<Order>

export const OrderModel = model('Order', orderSchema)
