import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose'
import {
  DESTINATION_TYPES,
  INTEGRATION_STATUSES,
  INTEGRATION_PROVIDER_KEYS,
} from '../services/integrations/integration.types.js'

/**
 * Integration credentials (Admin → Integrations).
 *
 * SECURITY MODEL
 * - Secret values (bot tokens, API keys, ...) are stored ONLY as AES-256-GCM
 *   ciphertext in the `secrets.*` columns. Plaintext never touches MongoDB.
 * - Non-secret configuration (base URL, destination type, provider name)
 *   lives in `metadata` (Mixed) — never put secrets there.
 * - One document per (organizationId, provider); the unique index enforces it.
 * - `organizationId` is always resolved SERVER-SIDE (constant today, tenant id
 *   later) — never trusted from a client payload.
 */

const integrationCredentialSchema = new Schema(
  {
    provider: { type: String, enum: [...INTEGRATION_PROVIDER_KEYS], required: true },
    /** Multi-tenant boundary. Currently the platform is single-tenant ('default'). */
    organizationId: { type: String, default: 'default', index: true },
    displayName: { type: String, default: '', maxlength: 120 },

    // Encrypted secrets — one column per known secret field (flexible enough
    // for every provider; values are `iv:tag:ciphertext` base64 strings).
    secrets: {
      botToken: { type: String, default: null },
      apiKey: { type: String, default: null },
      apiSecret: { type: String, default: null },
      chatId: { type: String, default: null },
      webhookSecret: { type: String, default: null },
    },

    // Non-secret provider configuration (baseUrl, destinationType, ...).
    metadata: { type: Schema.Types.Mixed, default: {} },

    // Telegram destinations — one row per chat (personal chats, groups,
    // supergroups and channels can all be listed). Each chatId is stored
    // ENCRYPTED (AES-256-GCM). `secrets.chatId` below mirrors the first
    // destination for backward compatibility.
    destinations: [
      {
        type: { type: String, enum: [...DESTINATION_TYPES], default: 'private' },
        chatId: { type: String, default: null },
        label: { type: String, default: '' },
      },
    ],

    isEnabled: { type: Boolean, default: true },
    status: { type: String, enum: [...INTEGRATION_STATUSES], default: 'NOT_CONFIGURED' },

    lastTestedAt: { type: Date, default: null },
    lastSuccessfulAt: { type: Date, default: null },
    lastFailedAt: { type: Date, default: null },
    lastErrorCode: { type: String, default: '' },
    lastErrorMessage: { type: String, default: '' },
    /** Latency of the most recent connection test, ms. */
    latencyMs: { type: Number, default: null },

    /** Recent connection-test history (safe fields only — never secrets). */
    connectionHistory: [
      {
        testedAt: { type: Date, required: true },
        success: { type: Boolean, required: true },
        latencyMs: { type: Number, default: null },
        errorCode: { type: String, default: '' },
      },
    ],

    createdBy: { type: String, default: '' },
    updatedBy: { type: String, default: '' },
  },
  { timestamps: true },
)

// One credential per organization + provider.
integrationCredentialSchema.index({ organizationId: 1, provider: 1 }, { unique: true })
// List by status (dashboard / health checks).
integrationCredentialSchema.index({ organizationId: 1, isEnabled: 1, status: 1 })

export type IntegrationCredential = InferSchemaType<typeof integrationCredentialSchema>
export type IntegrationCredentialDoc = HydratedDocument<IntegrationCredential>

export const IntegrationCredentialModel = model('IntegrationCredential', integrationCredentialSchema)
