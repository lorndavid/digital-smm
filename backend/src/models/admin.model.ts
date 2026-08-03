import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose'

export const ADMIN_ROLES = ['admin', 'super_admin'] as const
export type AdminRole = (typeof ADMIN_ROLES)[number]

const adminSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, index: true, trim: true, lowercase: true },
    /** scrypt hash in `salt:hash` format — never store plaintext. */
    passwordHash: { type: String, required: true },
    name: { type: String, default: '' },
    role: { type: String, enum: [...ADMIN_ROLES], default: 'admin' },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
)

export type Admin = InferSchemaType<typeof adminSchema>
export type AdminDoc = HydratedDocument<Admin>

export const AdminModel = model('Admin', adminSchema)
