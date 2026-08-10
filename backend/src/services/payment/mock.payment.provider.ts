import { randomUUID } from 'node:crypto'
import QRCode from 'qrcode'
import type {
  CreatePaymentInput,
  PaymentProvider,
  PaymentResult,
  ProviderPaymentStatus,
  ProviderRefundResult,
  ProviderWebhookEvent,
} from '../../interfaces/payment-provider.interface.js'
import { buildMockKhqr } from './khqr.util.js'

/**
 * In-memory ledger so the mock settles payments a few seconds after
 * creation (pending → scanned → paid), mirroring a real KHQR scan flow
 * for local demos. Replace with a real provider via PAYMENT_PROVIDER.
 */
const ledger = new Map<string, number>()

/**
 * Demo timings (ms). Env-overridable so load tests can freeze the mock at
 * 'pending' (e.g. MOCK_PAYMENT_PAID_MS=999999999) for deterministic phases.
 */
const SCANNED_AFTER = Number(process.env.MOCK_PAYMENT_SCANNED_MS ?? 3_000)
const PAID_AFTER = Number(process.env.MOCK_PAYMENT_PAID_MS ?? 8_000)
/** Optional fake hosted-checkout URL so the e2e stack can exercise the
 * deep-link vs hosted-checkout fallback branches (real CutLuy always sets
 * checkoutUrl). Empty by default → chips fall back to the QR only. */
const CHECKOUT_URL = process.env.MOCK_CHECKOUT_URL ?? ''

/**
 * Mock payment provider for local development. Implements the full
 * PaymentProvider contract so the CutLuy integration can be exercised
 * end-to-end without API keys.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock'

  async createPayment(input: CreatePaymentInput): Promise<PaymentResult> {
    const providerPaymentId = randomUUID()
    ledger.set(providerPaymentId, Date.now())

    const payload = buildMockKhqr({
      merchant: 'DigitalSMM',
      reference: input.referenceId,
      amount: input.amount,
      currency: input.currency,
    })
    const qrCodeDataUrl = await QRCode.toDataURL(payload, {
      width: 320,
      margin: 2,
      errorCorrectionLevel: 'M',
    })

    return {
      providerPaymentId,
      status: 'pending',
      qrString: payload,
      qrCodeDataUrl,
      checkoutUrl: CHECKOUT_URL,
      expiresAt: new Date(Date.now() + 15 * 60_000), // 15 minutes
    }
  }

  /** pending → scanned (3s) → paid (8s) so the demo shows the full flow. */
  async getPayment(providerPaymentId: string): Promise<ProviderPaymentStatus> {
    const createdAt = ledger.get(providerPaymentId) ?? Date.now()
    const elapsed = Date.now() - createdAt
    if (elapsed >= PAID_AFTER) {
      return { status: 'paid', approvedAt: new Date(createdAt + PAID_AFTER) }
    }
    if (elapsed >= SCANNED_AFTER) {
      return { status: 'scanned' }
    }
    return { status: 'pending' }
  }

  async refund(_providerPaymentId: string, _amount?: number): Promise<ProviderRefundResult> {
    throw new Error('Mock provider does not support refunds')
  }

  verifyWebhook(
    _rawBody: Buffer,
    _headers: Record<string, string | string[] | undefined>,
  ): ProviderWebhookEvent {
    throw new Error('Mock provider has no webhooks')
  }
}
