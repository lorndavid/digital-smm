import type { AdapterTestResult, DecryptedCredentials, IntegrationConfig } from '../integration.types.js'

/**
 * Culture / Translation API adapter.
 *
 * The provider endpoint is NOT specified yet, so per the project rule this
 * adapter deliberately implements NO fake API calls. Configuration
 * (base URL + key) is stored through the standard credential system; the
 * connection test returns UNSUPPORTED until a documented provider endpoint
 * is connected. Future work: implement `testCultureConnection` against the
 * real provider docs and add runtime methods (translate, detectLanguage…)
 * here.
 */
export async function testCultureConnection(
  _creds: DecryptedCredentials,
  _config: IntegrationConfig,
): Promise<AdapterTestResult> {
  return {
    success: false,
    errorCode: 'UNSUPPORTED',
    message:
      'The Culture API provider has no documented testable endpoint yet. Connect a documented provider to enable testing.',
  }
}
