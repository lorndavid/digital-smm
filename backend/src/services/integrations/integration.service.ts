import { IntegrationCredentialModel } from '../../models/integration-credential.model.js'
import { ApiError } from '../../utils/api-error.js'
import { logger } from '../../utils/logger.js'
import { decryptSecret, encryptSecret } from './credential-crypto.service.js'
import { testCultureConnection } from './adapters/culture.adapter.js'
import { testSmmConnection } from './adapters/smm.adapter.js'
import {
  sendTelegramMessage as sendTelegram,
  testTelegramConnection,
  validateTelegramBot,
} from './adapters/telegram.adapter.js'
import {
  INTEGRATION_PROVIDERS,
  type AdapterTestResult,
  type DecryptedCredentials,
  type IntegrationConfig,
  type IntegrationErrorCode,
  type IntegrationProviderKey,
  type IntegrationSafeView,
  type SecretField,
} from './integration.types.js'
import {
  applySecretUpdate,
  isConfigured,
  secretColumnForField,
  toSafeView,
} from './integration-view.js'

/**
 * Integration credential store — the single place that reads/writes
 * encrypted provider credentials.
 *
 * SECURITY INVARIANTS
 * - Secrets are encrypted before write and decrypted only inside this
 *   service (or by jobs via `getDecryptedCredentials`).
 * - `toSafeView` output is the ONLY shape that ever leaves the backend.
 * - `organizationId` is always this constant — never accepted from clients.
 *   Multi-tenant support = derive it from the admin session instead.
 */

const DEFAULT_ORG = 'default'
const MAX_HISTORY = 20

export const secretFields = ['botToken', 'apiKey', 'apiSecret', 'chatId', 'webhookSecret'] as const

/** Adapters keyed by provider — register new adapters here. */
async function runAdapterTest(
  provider: IntegrationProviderKey,
  creds: DecryptedCredentials,
  config: IntegrationConfig,
): Promise<AdapterTestResult> {
  switch (provider) {
    case 'telegram':
      return testTelegramConnection(creds)
    case 'smm':
      return testSmmConnection(creds, config)
    case 'culture':
      return testCultureConnection(creds, config)
    default:
      return { success: false, errorCode: 'UNSUPPORTED', message: 'No adapter registered for this provider.' }
  }
}

async function findDoc(provider: IntegrationProviderKey) {
  return IntegrationCredentialModel.findOne({ organizationId: DEFAULT_ORG, provider }).exec()
}

type SecretsLike = {
  botToken?: string | null
  apiKey?: string | null
  apiSecret?: string | null
  chatId?: string | null
  webhookSecret?: string | null
} | null

/** Decrypts every configured secret into an in-memory credential object. */
export function decryptCredentials(doc: { secrets?: SecretsLike }): DecryptedCredentials {
  const out: DecryptedCredentials = {}
  for (const field of secretFields) {
    const raw = doc.secrets?.[field]
    if (typeof raw === 'string' && raw.length > 0) {
      try {
        out[field] = decryptSecret(raw)
      } catch {
        logger.warn('[integrations] failed to decrypt a stored credential', { field })
      }
    }
  }
  return out
}

/** Empty safe view for a provider that has never been configured. */
function emptyView(provider: IntegrationProviderKey): IntegrationSafeView {
  const meta = INTEGRATION_PROVIDERS[provider]
  const credentials: IntegrationSafeView['credentials'] = {}
  for (const field of meta.fields) {
    if (field.type === 'secret') credentials[field.key] = { configured: false, masked: null }
  }
  return {
    provider,
    displayName: '',
    configured: false,
    enabled: false,
    status: 'NOT_CONFIGURED',
    lastTestedAt: null,
    lastSuccessfulAt: null,
    lastFailedAt: null,
    lastErrorCode: '',
    lastErrorMessage: '',
    latencyMs: null,
    credentials,
    config: {},
    connectionHistory: [],
  }
}

/** Safe views for every registered provider (dashboard + list page). */
export async function listIntegrations(): Promise<IntegrationSafeView[]> {
  const docs = await IntegrationCredentialModel.find({ organizationId: DEFAULT_ORG }).lean().exec()
  const byProvider = new Map(docs.map((d) => [d.provider, d]))
  const providers = Object.keys(INTEGRATION_PROVIDERS) as IntegrationProviderKey[]
  return providers.map((provider) => {
    const doc = byProvider.get(provider)
    return doc ? toSafeView(doc) : emptyView(provider)
  })
}

/** Safe view for one provider. Throws 404 for unknown providers. */
export async function getIntegration(provider: string): Promise<IntegrationSafeView> {
  if (!isProviderKey(provider)) throw new ApiError(404, 'Unknown integration provider')
  const doc = await findDoc(provider)
  return doc ? toSafeView(doc) : emptyView(provider)
}

export function isProviderKey(value: string): value is IntegrationProviderKey {
  return value in INTEGRATION_PROVIDERS
}

export interface SaveIntegrationInput {
  displayName?: string
  isEnabled?: boolean
  /** Secret values: undefined = keep, '' = clear, otherwise replace. */
  secrets?: Partial<Record<SecretField, string>>
  /** Non-secret configuration merged into metadata. */
  config?: IntegrationConfig
}

/** Creates or updates the credential for a provider. Returns the safe view. */
export async function saveIntegration(
  provider: string,
  input: SaveIntegrationInput,
  actor?: { id?: string; email?: string },
): Promise<IntegrationSafeView> {
  if (!isProviderKey(provider)) throw new ApiError(404, 'Unknown integration provider')

  const existing = await findDoc(provider)
  const secretPatch: Partial<Record<SecretField, string | null>> = {}

  const fieldMeta = INTEGRATION_PROVIDERS[provider].fields
  for (const field of fieldMeta) {
    if (field.type !== 'secret') continue
    const column = secretColumnForField(field.key)
    if (!column) continue
    const incoming = input.secrets?.[column]
    const current = existing?.secrets?.[column] ?? null
    Object.assign(secretPatch, applySecretUpdate(column, current, incoming, encryptSecret))
  }

  // Non-secret config is stored in metadata (Mixed) — never a secret field.
  const metadata = {
    ...(existing?.metadata ?? {}),
    ...(input.config ?? {}),
  }

  const now = new Date()
  const actorId = actor?.id ?? ''
  const actorEmail = actor?.email ?? ''

  const secretFieldsSet = Object.fromEntries(
    Object.entries(secretPatch).map(([k, v]) => [`secrets.${k}`, v]),
  )
  const setClause: Record<string, unknown> = {
    displayName: input.displayName ?? existing?.displayName ?? '',
    isEnabled: input.isEnabled ?? existing?.isEnabled ?? true,
    metadata,
    updatedBy: actorId,
    ...secretFieldsSet,
  }

  const doc = existing
    ? await IntegrationCredentialModel.findOneAndUpdate(
        { organizationId: DEFAULT_ORG, provider },
        { $set: setClause },
        { new: true },
      )
        .exec()
    : await IntegrationCredentialModel.create({
        organizationId: DEFAULT_ORG,
        provider,
        displayName: input.displayName ?? '',
        isEnabled: input.isEnabled ?? true,
        metadata,
        secrets: secretPatch,
        createdBy: actorId,
        updatedBy: actorId,
        status: 'NOT_CONFIGURED',
        connectionHistory: [],
      })
  if (!doc) throw new ApiError(500, 'Failed to save the integration')

  void log('info', 'integration.save', { provider, actor: actorEmail, displayName: input.displayName })
  return toSafeView(doc)
}

/** Deletes the credential. Publishing history is untouched (none exists yet). */
export async function deleteIntegration(provider: string, actor?: { id?: string; email?: string }): Promise<void> {
  if (!isProviderKey(provider)) throw new ApiError(404, 'Unknown integration provider')
  const deleted = await IntegrationCredentialModel.findOneAndDelete({
    organizationId: DEFAULT_ORG,
    provider,
  }).exec()
  if (!deleted) throw new ApiError(404, 'Integration not configured')
  void log('info', 'integration.delete', { provider, actor: actor?.email })
}

/** Enables or disables an integration. Disabled = stored but unusable. */
export async function setEnabled(
  provider: string,
  enabled: boolean,
  actor?: { id?: string; email?: string },
): Promise<IntegrationSafeView> {
  if (!isProviderKey(provider)) throw new ApiError(404, 'Unknown integration provider')
  const existing = await findDoc(provider)
  if (!existing) throw new ApiError(404, 'Integration not configured')
  const doc = await IntegrationCredentialModel.findOneAndUpdate(
    { organizationId: DEFAULT_ORG, provider },
    { $set: { isEnabled: enabled, updatedBy: actor?.id ?? '' } },
    { new: true },
  ).exec()
  if (!doc) throw new ApiError(404, 'Integration not configured')
  void log('info', enabled ? 'integration.enabled' : 'integration.disabled', { provider, actor: actor?.email })
  return toSafeView(doc)
}

export interface ConnectionTestOutcome {
  success: boolean
  provider: IntegrationProviderKey
  status: IntegrationSafeView['status']
  latencyMs: number
  checkedAt: string
  errorCode?: IntegrationErrorCode
  message?: string
  details?: Record<string, unknown>
}

/**
 * Runs a real connection test against the provider using the stored
 * (encrypted → decrypted in memory) credentials. Updates status, timestamps
 * and connection history. Returns a safe outcome — never a secret.
 */
export async function testConnection(
  provider: string,
  actor?: { id?: string; email?: string },
): Promise<ConnectionTestOutcome> {
  if (!isProviderKey(provider)) throw new ApiError(404, 'Unknown integration provider')

  const existing = await findDoc(provider)
  if (!existing) {
    return {
      success: false,
      provider,
      status: 'NOT_CONFIGURED',
      latencyMs: 0,
      checkedAt: new Date().toISOString(),
      errorCode: 'NOT_CONFIGURED',
      message: 'Configure and save this integration first.',
    }
  }
  if (!existing.isEnabled) {
    return {
      success: false,
      provider,
      status: 'DISABLED',
      latencyMs: 0,
      checkedAt: new Date().toISOString(),
      errorCode: 'UNKNOWN_ERROR',
      message: 'This integration is disabled. Enable it before testing.',
    }
  }

  const creds = decryptCredentials(existing)
  const config = (existing.metadata ?? {}) as IntegrationConfig

  const started = performance.now()
  let result: AdapterTestResult
  try {
    result = await runAdapterTest(provider, creds, config)
  } catch (err) {
    result = {
      success: false,
      errorCode: 'UNKNOWN_ERROR',
      message: err instanceof Error ? err.message : 'Connection test failed.',
    }
  }
  const latencyMs = Math.round(performance.now() - started)

  const status = result.success ? 'CONNECTED' : 'CONNECTION_FAILED'
  const patch: Record<string, unknown> = {
    status,
    lastTestedAt: new Date(),
    latencyMs,
    ...(result.success
      ? { lastSuccessfulAt: new Date(), lastErrorCode: '', lastErrorMessage: '' }
      : {
          lastFailedAt: new Date(),
          lastErrorCode: result.errorCode ?? 'UNKNOWN_ERROR',
          lastErrorMessage: result.message ?? 'Connection failed.',
        }),
  }

  await IntegrationCredentialModel.updateOne(
    { organizationId: DEFAULT_ORG, provider },
    {
      $set: patch,
      $push: {
        connectionHistory: {
          $each: [
            {
              testedAt: new Date(),
              success: result.success,
              latencyMs,
              errorCode: result.errorCode ?? (result.success ? '' : 'UNKNOWN_ERROR'),
            },
          ],
          $slice: -MAX_HISTORY,
        },
      },
    },
  ).exec()

  void log('info', 'integration.test', {
    provider,
    actor: actor?.email,
    success: result.success,
    latencyMs,
    ...(result.errorCode ? { errorCode: result.errorCode } : {}),
  })

  return {
    success: result.success,
    provider,
    status,
    latencyMs,
    checkedAt: new Date().toISOString(),
    errorCode: result.errorCode,
    message: result.message,
    details: result.details,
  }
}

/** Telegram: sends a harmless test message to the configured destination. */
export async function sendTelegramTestMessage(actor?: { id?: string; email?: string }): Promise<{ messageId: number }> {
  const doc = await findDoc('telegram')
  if (!doc || !isConfigured(doc)) {
    throw new ApiError(400, 'Telegram is not configured. Save a bot token and chat ID first.')
  }
  if (!doc.isEnabled) throw new ApiError(400, 'Telegram is disabled. Enable it before sending test messages.')
  const creds = decryptCredentials(doc)
  if (!creds.botToken || !creds.chatId) throw new ApiError(400, 'Telegram credentials are incomplete.')
  try {
    const result = await sendTelegram(creds.botToken, creds.chatId, '<b>✅ DigitalSMM</b> — test message from the admin panel.')
    void log('info', 'integration.test_message', { provider: 'telegram', actor: actor?.email })
    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send the test message.'
    throw new ApiError(502, message)
  }
}

/**
 * Lightweight health probe for background checks — the LIGHTEST possible
 * call per provider (Telegram getMe, SMM balance). Never writes history.
 */
export async function runHealthProbe(provider: string): Promise<boolean> {
  if (!isProviderKey(provider)) return false
  const doc = await findDoc(provider)
  if (!doc || !doc.isEnabled || !isConfigured(doc)) return false
  const creds = decryptCredentials(doc)
  const config = (doc.metadata ?? {}) as IntegrationConfig
  try {
    switch (provider) {
      case 'telegram':
        if (!creds.botToken) return false
        await validateTelegramBot(creds.botToken)
        return true
      case 'smm': {
        const result = await testSmmConnection(creds, config)
        return result.success
      }
      default:
        return false // culture has no probe endpoint yet
    }
  } catch {
    return false
  }
}

/** Internal decrypted access for jobs/workers. NEVER expose via API. */
export async function getDecryptedCredentials(
  provider: string,
): Promise<{ creds: DecryptedCredentials; config: IntegrationConfig } | null> {
  if (!isProviderKey(provider)) return null
  const doc = await findDoc(provider)
  if (!doc) return null
  return { creds: decryptCredentials(doc), config: (doc.metadata ?? {}) as IntegrationConfig }
}

/** Best-effort structured log (never contains secrets). */
function log(level: 'info' | 'warn', action: string, meta: Record<string, unknown>): void {
  const safe = { ...meta }
  delete (safe as Record<string, unknown>).secrets
  if (level === 'warn') logger.warn(`[integrations] ${action}`, safe)
  else logger.info(`[integrations] ${action}`, safe)
}
