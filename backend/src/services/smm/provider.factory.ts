import { env } from '../../config/env.js'
import type { SmmProvider } from '../../interfaces/smm-provider.interface.js'
import { MockProvider } from './mock.provider.js'
import { SmmWizProvider } from './smmwiz.provider.js'

let instance: SmmProvider | null = null

/**
 * Returns the configured SMM provider (singleton).
 * Register additional providers here as the catalogue grows.
 */
export function getSmmProvider(): SmmProvider {
  if (!instance) {
    instance = env.SMM_PROVIDER === 'mock' ? new MockProvider() : new SmmWizProvider()
  }
  return instance
}
