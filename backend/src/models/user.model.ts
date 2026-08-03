import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose'
import { USER_ROLES } from '../types/index.js'

const userSchema = new Schema(
  {
    clerkId: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    name: { type: String, default: '' },
    avatarUrl: { type: String, default: '' },
    role: { type: String, enum: [...USER_ROLES], default: 'customer' },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
)

export type User = InferSchemaType<typeof userSchema>
export type UserDoc = HydratedDocument<User>

export const UserModel = model('User', userSchema)
