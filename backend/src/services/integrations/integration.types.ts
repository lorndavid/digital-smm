/**
 * Admin Integrations — shared types, provider registry and field metadata.
 *
 * Adding a new provider = add a key here, describe its fields, and register
 * an adapter in `adapters/`. The admin UI renders forms from this metadata,
 * so no provider-specific UI code is required.
 */

export const INTEGRATION_PROVIDER_KEYS = ['telegram', 'smm', 'culture'] as const
export type IntegrationProviderKey = (typeof INTEGRATION_PROVIDER_KEYS)[number]

/** Mirror of the UI statuses — see docs/integrations.md for semantics. */
export const INTEGRATION_STATUSES = [
  'CONNECTED',
  'NOT_CONFIGURED',
  'CONNECTION_FAILED',
  'DISABLED',
  'TESTING',
  'EXPIRED',
] as const
export type IntegrationStatus = (typeof INTEGRATION_STATUSES)[number]

/** Normalized error codes returned to the admin UI (never raw provider text). */
export const INTEGRATION_ERROR_CODES = [
  'INVALID_CREDENTIALS',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'RATE_LIMITED',
  'TIMEOUT',
  'NETWORK_ERROR',
  'INVALID_DESTINATION',
  'PROVIDER_UNAVAILABLE',
  'NOT_CONFIGURED',
  'UNSUPPORTED',
  'UNKNOWN_ERROR',
] as const
export type IntegrationErrorCode = (typeof INTEGRATION_ERROR_CODES)[number]

/** Where a secret field may appear in the model. */
export const SECRET_FIELDS = ['botToken', 'apiKey', 'apiSecret', 'chatId', 'webhookSecret'] as const
export type SecretField = (typeof SECRET_FIELDS)[number]

export interface ProviderFieldDef {
  key: string
  label: string
  type: 'secret' | 'text' | 'url' | 'enum'
  required?: boolean
  hint?: string
  placeholder?: string
  /** Show last N characters of a configured secret (default: full mask). */
  reveal?: number
  options?: Array<{ value: string; label: string }>
}

export interface ProviderMeta {
  key: IntegrationProviderKey
  name: string
  description: string
  category: string
  supportsTest: boolean
  /** Telegram only — allows the admin to send a test message. */
  supportsSendTestMessage?: boolean
  fields: ProviderFieldDef[]
}

/**
 * Provider metadata consumed by both the backend (safe views, validation)
 * and documented for the admin UI. Extend this map to add providers.
 */
export const INTEGRATION_PROVIDERS: Record<IntegrationProviderKey, ProviderMeta> = {
  telegram: {
    key: 'telegram',
    name: 'Telegram',
    description: 'Bot configuration and publishing — operational alerts, announcements and future content publishing.',
    category: 'Messaging',
    supportsTest: true,
    supportsSendTestMessage: true,
    fields: [
      {
        key: 'botToken',
        label: 'Bot Token',
        type: 'secret',
        required: true,
        hint: 'From @BotFather. Your token is encrypted before being stored.',
        placeholder: '123456789:AA...',
      },
      {
        key: 'chatId',
        label: 'Destination Chat ID',
        type: 'secret',
        required: true,
        reveal: 4,
        hint: 'Private chat: 123456789 · Group/supergroup: -1001234567890 · Channel: -100… or @channelusername',
        placeholder: '-1001234567890',
      },
      {
        key: 'destinationType',
        label: 'Destination Type',
        type: 'enum',
        options: [
          { value: 'private', label: 'Private Chat' },
          { value: 'group', label: 'Group' },
          { value: 'supergroup', label: 'Supergroup' },
          { value: 'channel', label: 'Channel' },
        ],
      },
    ],
  },
  smm: {
    key: 'smm',
    name: 'SMM Provider',
    description: 'Social media service provider — order fulfilment API credentials.',
    category: 'Providers',
    supportsTest: true,
    fields: [
      {
        key: 'providerName',
        label: 'Provider Name',
        type: 'text',
        hint: 'Display name, e.g. "wizsmm".',
      },
      {
        key: 'baseUrl',
        label: 'API Base URL',
        type: 'url',
        required: true,
        placeholder: 'https://wizsmm.com/api/v2',
      },
      {
        key: 'apiKey',
        label: 'API Key',
        type: 'secret',
        required: true,
        hint: 'Your key is encrypted before being stored.',
        placeholder: '••••••••••••••••',
      },
    ],
  },
  culture: {
    key: 'culture',
    name: 'Culture API',
    description: 'Translation / language service. Adapter interface is ready; connect a documented provider to enable testing.',
    category: 'Providers',
    supportsTest: false,
    fields: [
      {
        key: 'baseUrl',
        label: 'API Base URL',
        type: 'url',
        placeholder: 'https://provider.example/api',
      },
      {
        key: 'apiKey',
        label: 'API Key',
        type: 'secret',
        hint: 'Your key is encrypted before being stored.',
        placeholder: '••••••••••••••••',
      },
    ],
  },
}

export const ALL_PROVIDERS: ProviderMeta[] = INTEGRATION_PROVIDER_KEYS.map((k) => INTEGRATION_PROVIDERS[k])

/** Result of an adapter connection test (safe — no secret values). */
export interface AdapterTestResult {
  success: boolean
  status?: IntegrationStatus
  errorCode?: IntegrationErrorCode
  message?: string
  /** Provider-specific safe info: bot username, destination type, balance… */
  details?: Record<string, unknown>
}

/** Decrypted credentials passed to adapters — INTERNAL ONLY, never exposed. */
export interface DecryptedCredentials {
  botToken?: string
  chatId?: string
  apiKey?: string
  apiSecret?: string
  webhookSecret?: string
}

/** Non-secret configuration from the credential's `metadata`. */
export interface IntegrationConfig {
  baseUrl?: string
  providerName?: string
  destinationType?: string
  [key: string]: unknown
}

/** Safe representation of a secret field for the admin UI. */
export interface SecretFieldView {
  configured: boolean
  masked: string | null
}

/** Safe representation of one integration for the admin UI. */
export interface IntegrationSafeView {
  provider: IntegrationProviderKey
  displayName: string
  configured: boolean
  enabled: boolean
  status: IntegrationStatus
  lastTestedAt: string | null
  lastSuccessfulAt: string | null
  lastFailedAt: string | null
  lastErrorCode: string
  lastErrorMessage: string
  latencyMs: number | null
  /** Secret fields — configured + masked ONLY. Never the plaintext. */
  credentials: Record<string, SecretFieldView>
  /** Non-secret configuration (baseUrl, destinationType, ...). */
  config: Record<string, unknown>
  /** Connection-test history (safe fields only). */
  connectionHistory: Array<{
    testedAt: string
    success: boolean
    latencyMs: number | null
    errorCode: string
  }>
}
