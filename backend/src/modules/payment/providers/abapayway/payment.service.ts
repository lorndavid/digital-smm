import type {
  CreatePaymentInput,
  PaymentProvider,
  PaymentResult,
  ProviderPaymentStatus,
  ProviderRefundResult,
  ProviderWebhookEvent,
} from '../../../../interfaces/payment-provider.interface.js'
import { AbaPayWayClient } from './client.js'
import { getAbaPayWayConfig } from './config.js'
import { hashesMatch, ipnHash } from './hash.js'
import { ABA_SUCCESS_CODE } from './types.js'

/**
 * ABA PayWay provider (hosted checkout / redirect flow).
 *
 * - createPayment → purchase → returns the hosted `payment_url` (no QR).
 * - getPayment    → check-payment polling by tran_id.
 * - verifyWebhook → validates the IPN `hash` (HMAC-SHA512 of
 *                   tran_id + amount + merchant_id).
 * - refund        → not exposed by the PayWay gateway; throws.
 *
 * Enable with PAYMENT_PROVIDER=abapayway + ABAPAYWAY_MERCHANT_ID/API_KEY.
 */
export class AbaPayWayProvider implements PaymentProvider {
  readonly name = 'abapayway'

  async createPayment(input: CreatePaymentInput): Promise<PaymentResult> {
    const config = getAbaPayWayConfig()
    if (!config.merchantId || !config.apiKey) {
      throw new Error('ABA PayWay merchant credentials are not configured')
    }

    // tran_id must be unique per transaction; we use the internal reference.
    const tranId = input.referenceId.replace(/[^A-Za-z0-9_-]/g, '')
    const result = await new AbaPayWayClient(config).purchase({
      tranId,
      amount: input.amount.toFixed(2),
      email: String(input.metadata?.email ?? ''),
    })

    if (result.status?.code !== ABA_SUCCESS_CODE || !result.payment_url) {
      throw new Error(`ABA PayWay: ${result.status?.message ?? 'purchase failed'}`)
    }

    return {
      providerPaymentId: tranId,
      status: 'pending',
      checkoutUrl: result.payment_url,
      expiresAt: new Date(Date.now() + 60 * 60_000), // 1 hour
    }
  }

  async getPayment(providerPaymentId: string): Promise<ProviderPaymentStatus> {
    const config = getAbaPayWayConfig()
    if (!config.merchantId || !config.apiKey) {
      throw new Error('ABA PayWay merchant credentials are not configured')
    }
    const result = await new AbaPayWayClient(config).checkPayment(providerPaymentId)
    const paid = result.status?.code === ABA_SUCCESS_CODE
    return {
      status: paid ? 'paid' : 'pending',
      approvedAt: result.last_updated ? new Date(result.last_updated) : null,
      amount: result.amount ? Number(result.amount) : undefined,
    }
  }

  async refund(_providerPaymentId: string, _amount?: number): Promise<ProviderRefundResult> {
    throw new Error('ABA PayWay refunds are not supported by this build')
  }

  verifyWebhook(
    rawBody: Buffer,
    _headers: Record<string, string | string[] | undefined>,
  ): ProviderWebhookEvent {
    const config = getAbaPayWayConfig()
    const params = new URLSearchParams(rawBody.toString('utf8'))

    const tranId = params.get('tran_id') ?? ''
    const amount = params.get('amount') ?? ''
    const status = params.get('status') ?? ''
    const hash = params.get('hash') ?? ''

    if (!tranId || !hash) {
      throw new Error('ABA PayWay IPN is missing tran_id or hash')
    }

    const expected = ipnHash(config.apiKey, tranId, amount, config.merchantId)
    if (!hashesMatch(expected, hash)) {
      throw new Error('ABA PayWay IPN hash mismatch')
    }

    const paid = status === ABA_SUCCESS_CODE
    return {
      type: paid ? 'payment.completed' : 'payment.failed',
      eventId: tranId,
      providerPaymentId: tranId,
      status: paid ? 'paid' : 'failed',
      raw: { tran_id: tranId, amount, status },
    }
  }
}
