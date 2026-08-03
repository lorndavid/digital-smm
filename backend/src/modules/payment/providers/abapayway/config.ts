import { env } from '../../../../config/env.js'

export interface AbaPayWayConfig {
  apiUrl: string
  merchantId: string
  apiKey: string
  returnUrl: string
}

/** Reads ABA PayWay configuration lazily from env. */
export function getAbaPayWayConfig(): AbaPayWayConfig {
  return {
    apiUrl: env.ABAPAYWAY_API_URL,
    merchantId: env.ABAPAYWAY_MERCHANT_ID ?? '',
    apiKey: env.ABAPAYWAY_API_KEY ?? '',
    returnUrl: env.ABAPAYWAY_RETURN_URL,
  }
}

export function isAbaPayWayConfigured(): boolean {
  const { merchantId, apiKey } = getAbaPayWayConfig()
  return Boolean(merchantId && apiKey)
}
