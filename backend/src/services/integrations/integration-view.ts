import { decryptSecret, maskSecret } from './credential-crypto.service.js'
import {
  INTEGRATION_PROVIDERS,
  type DestinationType,
  type IntegrationSafeView,
  type IntegrationStatus,
  type ProviderFieldDef,
  type SecretField,
} from './integration.types.js'

/**
 * Pure, database-free helpers for the integration store.
 * Kept separate from `integration.service.ts` so the security-critical
 * logic (masking, secret update semantics, status) is unit-testable
 * without a database.
 */

const SECRET_COLUMN_BY_FIELD: Record<string, SecretField> = {
  botToken: 'botToken',
  chatId: 'chatId',
  apiKey: 'apiKey',
  apiSecret: 'apiSecret',
  webhookSecret: 'webhookSecret',
}

/** Which secret column a provider field maps to. */
export function secretColumnForField(fieldKey: string): SecretField | undefined {
  return SECRET_COLUMN_BY_FIELD[fieldKey]
}

const SECRET_FIELDS: SecretField[] = ['botToken', 'apiKey', 'apiSecret', 'chatId', 'webhookSecret']

/** The secrets subdocument may be absent/null on raw docs. */
type SecretsLike = Partial<Record<SecretField, string | null>> | null

/** Structural source accepted by toSafeView (raw docs, Mongoose docs, lean). */
type ViewSource = {
  provider?: string
  displayName?: string
  secrets?: SecretsLike
  metadata?: Record<string, unknown> | null
  isEnabled?: boolean
  status?: string
  lastTestedAt?: unknown
  lastSuccessfulAt?: unknown
  lastFailedAt?: unknown
  lastErrorCode?: unknown
  lastErrorMessage?: unknown
  latencyMs?: unknown
  destinations?: unknown
  connectionHistory?: unknown
}

/** True when the document has at least one secret configured. */
export function isConfigured(doc: { secrets?: SecretsLike }): boolean {
  const secrets = doc.secrets
  if (!secrets) return false
  return SECRET_FIELDS.some((field) => typeof secrets[field] === 'string' && secrets[field]!.length > 0)
}

/** Effective status: DISABLED wins over everything, then configured/test results. */
export function effectiveStatus(doc: {
  isEnabled?: boolean
  status?: string
  secrets?: SecretsLike
}): IntegrationStatus {
  if (doc.isEnabled === false) return 'DISABLED'
  if (!isConfigured(doc)) return 'NOT_CONFIGURED'
  return doc.status === 'NOT_CONFIGURED' ? 'NOT_CONFIGURED' : (doc.status as IntegrationStatus)
}

/**
 * Serializes one credential document into the SAFE view sent to the admin
 * UI. Guarantees: no secret field is ever present in plaintext — secret
 * fields appear only as `{ configured, masked }`.
 */
export function toSafeView(doc: ViewSource): IntegrationSafeView {
  const meta = INTEGRATION_PROVIDERS[(doc.provider ?? '') as keyof typeof INTEGRATION_PROVIDERS]
  const credentials: IntegrationSafeView['credentials'] = {}

  // Telegram destinations — decrypt only for masking (server-side), expose
  // masked tails + type. Backfills legacy single-chatId docs.
  const rawDestinations = Array.isArray(doc.destinations) ? (doc.destinations as unknown[]) : []
  const destinations: IntegrationSafeView['destinations'] = []
  for (const raw of rawDestinations) {
    const d = (raw ?? {}) as Record<string, unknown>
    const type = (d.type as DestinationType) ?? 'private'
    const encrypted = typeof d.chatId === 'string' ? d.chatId : null
    let masked: string | null = null
    if (encrypted) {
      try {
        masked = maskSecret(decryptSecret(encrypted), 4)
      } catch {
        masked = null
      }
    }
    destinations.push({
      type,
      configured: Boolean(encrypted),
      masked,
      label: String(d.label ?? ''),
    })
  }
  // Legacy: single encrypted chatId + metadata.destinationType.
  const legacyChatId = doc.secrets?.chatId
  if (destinations.length === 0 && legacyChatId) {
    const legacyType = ((doc.metadata as Record<string, unknown> | null)?.destinationType as DestinationType) ?? 'private'
    try {
      destinations.push({
        type: legacyType,
        configured: true,
        masked: maskSecret(decryptSecret(legacyChatId), 4),
        label: '',
      })
    } catch {
      destinations.push({ type: legacyType, configured: true, masked: null, label: '' })
    }
  }

  for (const field of meta?.fields ?? []) {
    if (field.type !== 'secret') continue
    const column = secretColumnForField(field.key)
    const stored = column ? doc.secrets?.[column] : undefined
    let masked: string | null = null
    if (stored) {
      if ((field.reveal ?? 0) > 0) {
        // Reveal the tail of the DECRYPTED value so the admin can verify the
        // configured ID — decryption happens server-side, only the tail is exposed.
        try {
          masked = maskSecret(decryptSecret(stored), field.reveal ?? 0)
        } catch {
          masked = maskSecret(stored, 0)
        }
      } else {
        masked = maskSecret(stored, 0)
      }
    }
    credentials[field.key] = {
      configured: Boolean(stored),
      masked,
    }
  }
  // Legacy single-chatId view: mirror the first destination.
  if (destinations.length > 0 && !credentials.chatId) {
    credentials.chatId = {
      configured: destinations[0]!.configured,
      masked: destinations[0]!.masked,
    }
  }

  const rawHistory = Array.isArray(doc.connectionHistory) ? (doc.connectionHistory as unknown[]) : []
  const history = rawHistory.map((entry) => {
    const e = (entry ?? {}) as Record<string, unknown>
    const testedAt = e.testedAt
    return {
      testedAt: testedAt instanceof Date ? testedAt.toISOString() : String(testedAt ?? ''),
      success: Boolean(e.success),
      latencyMs: typeof e.latencyMs === 'number' ? e.latencyMs : null,
      errorCode: String(e.errorCode ?? ''),
    }
  })

  return {
    provider: doc.provider as IntegrationSafeView['provider'],
    displayName: String(doc.displayName ?? ''),
    configured: isConfigured(doc),
    enabled: Boolean(doc.isEnabled),
    status: effectiveStatus(doc),
    lastTestedAt: doc.lastTestedAt ? new Date(doc.lastTestedAt as string | Date).toISOString() : null,
    lastSuccessfulAt: doc.lastSuccessfulAt ? new Date(doc.lastSuccessfulAt as string | Date).toISOString() : null,
    lastFailedAt: doc.lastFailedAt ? new Date(doc.lastFailedAt as string | Date).toISOString() : null,
    lastErrorCode: String(doc.lastErrorCode ?? ''),
    lastErrorMessage: String(doc.lastErrorMessage ?? ''),
    latencyMs: typeof doc.latencyMs === 'number' ? doc.latencyMs : null,
    credentials,
    destinations,
    config: { ...((doc.metadata as Record<string, unknown> | null) ?? {}) },
    connectionHistory: history.slice(0, 20),
  }
}

/** Non-secret provider fields for the UI (from registry metadata). */
export function nonSecretFields(provider: string): ProviderFieldDef[] {
  const meta = INTEGRATION_PROVIDERS[provider as keyof typeof INTEGRATION_PROVIDERS]
  return meta?.fields.filter((f) => f.type !== 'secret') ?? []
}

/**
 * Applies a saved secret field value:
 * - undefined → keep the existing encrypted value (do not touch)
 * - ''        → clear the stored secret (admin explicitly removed it)
 * - value     → encrypt and replace
 * Returns `{ [column]: encrypted | null }` to merge into the `secrets`
 * subdocument, or an empty object when nothing changes.
 */
export function applySecretUpdate(
  column: SecretField,
  currentEncrypted: string | null | undefined,
  incoming: string | undefined,
  encrypt: (plaintext: string) => string,
): Partial<Record<SecretField, string | null>> {
  if (incoming === undefined) return {} // keep existing
  const value = incoming.trim()
  if (value === '') {
    return currentEncrypted ? { [column]: null } : {} // explicit clear
  }
  return { [column]: encrypt(value) }
}
