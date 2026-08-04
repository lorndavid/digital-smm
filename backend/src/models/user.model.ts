import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose'
import { USER_ROLES } from '../types/index.js'

const userSchema = new Schema(
  {
    /**
     * External provider account id. Currently the Google `sub`; legacy rows
     * created under Clerk keep their old Clerk user id (provider: 'clerk').
     */
    providerId: { type: String, required: true, unique: true, index: true },
    /** Identity provider that created this account. */
    provider: { type: String, enum: ['google', 'clerk'], default: 'google' },
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
