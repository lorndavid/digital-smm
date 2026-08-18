import { Languages, Send, Server, type LucideIcon } from '@lucide/vue'
import type { IntegrationProviderKey } from '@/types/models'

/**
 * Provider metadata rendered by the Integrations UI. Mirrors the backend
 * registry (backend/src/services/integrations/integration.types.ts) — keep
 * field keys/labels in sync when adding providers. Forms are driven by
 * `fields`, so a new provider only needs an entry here + the backend
 * registry + an adapter.
 */
export interface IntegrationFieldDef {
  key: string
  label: string
  type: 'secret' | 'text' | 'url' | 'enum'
  required?: boolean
  hint?: string
  placeholder?: string
  /** Show the last N characters of a configured secret. */
  reveal?: number
  options?: Array<{ value: string; label: string }>
}

export interface IntegrationProviderMeta {
  key: IntegrationProviderKey
  name: string
  description: string
  icon: LucideIcon
  supportsTest: boolean
  supportsSendTestMessage?: boolean
  /** Telegram: destinations are a managed list (not single fields). */
  supportsMultipleDestinations?: boolean
  fields: IntegrationFieldDef[]
}

export const DESTINATION_TYPE_OPTIONS = [
  { value: 'private', label: 'Private Chat' },
  { value: 'group', label: 'Group' },
  { value: 'supergroup', label: 'Supergroup' },
  { value: 'channel', label: 'Channel' },
] as const

export const INTEGRATION_PROVIDER_META: Record<IntegrationProviderKey, IntegrationProviderMeta> = {
  telegram: {
    key: 'telegram',
    name: 'Telegram',
    description: 'Bot configuration and publishing — alerts, announcements and future content publishing.',
    icon: Send,
    supportsTest: true,
    supportsSendTestMessage: true,
    supportsMultipleDestinations: true,
    fields: [
      {
        key: 'botToken',
        label: 'Bot Token',
        type: 'secret',
        required: true,
        hint: 'From @BotFather. Your token is encrypted before being stored.',
        placeholder: '123456789:AA...',
      },
    ],
  },
  smm: {
    key: 'smm',
    name: 'SMM Provider',
    description: 'Social media service provider — order fulfilment API credentials.',
    icon: Server,
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
    icon: Languages,
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

export const ALL_INTEGRATION_PROVIDERS = Object.values(INTEGRATION_PROVIDER_META)
