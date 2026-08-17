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
    /** Raw rate per single unit as charged by the provider. */
    providerRate: { type: Number, default: 0, min: 0 },
    /** Admin profit percentage markup (e.g. 20 for 20%). */
    profitPercentage: { type: Number, default: 0, min: 0 },
    /** Price per single unit charged to customers (pricePerUnit = providerRate * (1 + profitPercentage / 100)). */
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

// Storefront catalog reads: active services by category + provider, and the
// SEO sitemap query (all active services).
serviceSchema.index({ isActive: 1, category: 1, sortOrder: 1 })
serviceSchema.index({ provider: 1, providerServiceId: 1 })

export const ServiceModel = model('Service', serviceSchema)
