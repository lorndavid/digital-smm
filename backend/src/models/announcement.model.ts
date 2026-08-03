import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose'
import { ANNOUNCEMENT_TYPES } from '../types/index.js'

const announcementSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    body: { type: String, default: '' },
    type: { type: String, enum: [...ANNOUNCEMENT_TYPES], default: 'info' },
    isActive: { type: Boolean, default: true, index: true },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true },
)

export type Announcement = InferSchemaType<typeof announcementSchema>
export type AnnouncementDoc = HydratedDocument<Announcement>

export const AnnouncementModel = model('Announcement', announcementSchema)
