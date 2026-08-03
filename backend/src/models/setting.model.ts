import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose'

const settingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    value: { type: Schema.Types.Mixed, default: null },
    description: { type: String, default: '' },
  },
  { timestamps: true },
)

export type Setting = InferSchemaType<typeof settingSchema>
export type SettingDoc = HydratedDocument<Setting>

export const SettingModel = model('Setting', settingSchema)
