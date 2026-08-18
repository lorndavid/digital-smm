import { SmmWizProvider } from '../../smm/smmwiz.provider.js'
import type { AdapterTestResult, DecryptedCredentials, IntegrationConfig } from '../integration.types.js'
import { classifyProviderError } from './errors.js'

/**
 * SMM Provider adapter — reuses the production wizsmm client
 * (services/smm/smmwiz.provider.ts) with credentials from the encrypted
 * integration store instead of environment variables.
 *
 * The connection test hits the safest read-only endpoint (balance). The
 * full SmmProvider interface (createOrder, getOrderStatus, ...) remains
 * available on `getSmmClient()` for future runtime use.
 */

export function getSmmClient(
  creds: DecryptedCredentials,
  config: IntegrationConfig,
): SmmWizProvider {
  const baseUrl = typeof config.baseUrl === 'string' ? config.baseUrl : ''
  const apiKey = creds.apiKey ?? ''
  if (!baseUrl || !apiKey) {
    throw new Error('SMM provider is missing baseUrl or apiKey')
  }
  return new SmmWizProvider(baseUrl, apiKey)
}

/** Connection test: authenticates with the provider and reads the balance. */
export async function testSmmConnection(
  creds: DecryptedCredentials,
  config: IntegrationConfig,
): Promise<AdapterTestResult> {
  if (typeof config.baseUrl !== 'string' || !config.baseUrl || !creds.apiKey) {
    return { success: false, errorCode: 'NOT_CONFIGURED', message: 'API base URL and API key are required.' }
  }
  try {
    const provider = getSmmClient(creds, config)
    const balance = await provider.getBalance()
    return {
      success: true,
      status: 'CONNECTED',
      details: {
        balance: balance.balance,
        currency: balance.currency,
      },
      message: 'Connection successful.',
    }
  } catch (err) {
    const info = classifyProviderError(err)
    return { success: false, errorCode: info.code, message: info.message }
  }
}
