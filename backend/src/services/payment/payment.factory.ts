import { env } from '../../config/env.js'
import { logger } from '../../utils/logger.js'
import type { PaymentProvider } from '../../interfaces/payment-provider.interface.js'
import { MockPaymentProvider } from './mock.payment.provider.js'
import { CutLuyPaymentProvider } from '../../modules/payment/providers/cutluy/payment.service.js'
import { isCutLuyConfigured } from '../../modules/payment/providers/cutluy/config.js'
import { AbaPayWayProvider } from '../../modules/payment/providers/abapayway/payment.service.js'
import { isAbaPayWayConfigured } from '../../modules/payment/providers/abapayway/config.js'

let instance: PaymentProvider | null = null

/**
 * Returns the configured payment provider (singleton):
 *   - mock       → local KHQR demo, no keys needed (default)
 *   - cutluy     → real Bakong KHQR via CutLuy (CUTLUY_API_KEY + secret)
 *   - abapayway  → ABA hosted checkout (ABAPAYWAY_MERCHANT_ID + API_KEY)
 */
export function getPaymentProvider(): PaymentProvider {
  if (!instance) {
    switch (env.PAYMENT_PROVIDER) {
      case 'cutluy': {
        if (!isCutLuyConfigured()) {
          logger.warn('[payment] PAYMENT_PROVIDER=cutluy but CUTLUY_API_KEY missing — falling back to mock')
          instance = new MockPaymentProvider()
        } else {
          instance = new CutLuyPaymentProvider()
        }
        break
      }
      case 'abapayway': {
        if (!isAbaPayWayConfigured()) {
          logger.warn('[payment] PAYMENT_PROVIDER=abapayway but ABA credentials missing — falling back to mock')
          instance = new MockPaymentProvider()
        } else {
          instance = new AbaPayWayProvider()
        }
        break
      }
      default:
        instance = new MockPaymentProvider()
    }
  }
  return instance
}

/** Current provider name (used by tests / diagnostics). */
export function activePaymentProviderName(): string {
  return getPaymentProvider().name
}
