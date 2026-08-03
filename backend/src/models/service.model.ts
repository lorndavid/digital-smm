import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose'
import { ServiceType } from '../types/index.js'

const serviceSchema = new Schema(
  {
    /** Service id as known by the provider (null for manually created services). */
    providerServiceId: { type: Number, default: null, index: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: Object.values(ServiceType), default: ServiceType.Default },
    category: { type: Schema.Types.ObjectId, ref: 'Category', index: true },
    description: { type: String, default: '' },
    image: { type: String, default: '' },
    /** Price per single unit (rate). */
    pricePerUnit: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'USD' },
    min: { type: Number, default: 0 },
    max: { type: Number, default: 0 },
    refill: { type: Boolean, default: false },
    cancel: { type: Boolean, default: false },
    deliveryTime: { type: String, default: '' },
    /** Where the order is fulfilled: 'smmwiz' or 'manual'. */
    provider: { type: String, default: 'smmwiz' },
    isActive: { type: Boolean, default: true, index: true },
    isFeatured: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
)

export type Service = InferSchemaType<typeof serviceSchema>
export type ServiceDoc = HydratedDocument<Service>

export const ServiceModel = model('Service', serviceSchema)
