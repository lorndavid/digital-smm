import { env } from '../../../../config/env.js'

export interface CutLuyConfig {
  apiUrl: string
  apiKey: string
  webhookSecret: string
}

/**
 * Reads the CutLuy configuration lazily so importing this module never
 * touches process.env (keeps tests and tree-shaking simple).
 */
export function getCutLuyConfig(): CutLuyConfig {
  return {
    apiUrl: env.CUTLUY_API_URL,
    apiKey: env.CUTLUY_API_KEY ?? '',
    webhookSecret: env.CUTLUY_WEBHOOK_SECRET ?? '',
  }
}

export function isCutLuyConfigured(): boolean {
  const { apiKey } = getCutLuyConfig()
  // The API key alone is enough to create KHQR payments and poll their
  // status. CUTLUY_WEBHOOK_SECRET is only required for webhook verification,
  // and verifyWebhook() fails closed when it is missing.
  return Boolean(apiKey)
}
