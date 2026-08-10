import { env } from '../../config/env.js'
import type { SmmProvider } from '../../interfaces/smm-provider.interface.js'
import { MockProvider } from './mock.provider.js'
import { SmmWizProvider } from './smmwiz.provider.js'

const providers: Record<string, () => SmmProvider> = {
  smmwiz: () => new SmmWizProvider(env.SMMWIZ_API_URL, env.SMMWIZ_API_KEY ?? ''),
  mock: () => new MockProvider(),
}

const instances = new Map<string, SmmProvider>()

/**
 * Returns the configured SMM provider by name.
 * Each provider is instantiated once and cached for the lifetime of the
 * process so connections / caches inside the provider are reused.
 *
 * Register additional providers in the `providers` map above.
 */
export function getSmmProvider(key?: string): SmmProvider {
  const providerKey = key ?? env.SMM_PROVIDER
  const cached = instances.get(providerKey)
  if (cached) return cached

  const factory = providers[providerKey]
  if (!factory) {
    throw new Error(`[provider.factory] Unknown SMM provider: ${providerKey}`)
  }
  const instance = factory()
  instances.set(providerKey, instance)
  return instance
}
