import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose'
import { PLATFORMS } from '../types/index.js'

const categorySchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    platform: { type: String, enum: [...PLATFORMS], default: 'other' },
    description: { type: String, default: '' },
    icon: { type: String, default: '' },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
)

export type Category = InferSchemaType<typeof categorySchema>
export type CategoryDoc = HydratedDocument<Category>

export const CategoryModel = model('Category', categorySchema)
