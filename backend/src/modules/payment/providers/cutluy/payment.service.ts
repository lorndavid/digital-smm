import type {
  CreatePaymentInput,
  PaymentProvider,
  PaymentResult,
  ProviderPaymentStatus,
  ProviderRefundResult,
  ProviderWebhookEvent,
} from '../../../../interfaces/payment-provider.interface.js'
import { CutLuyClient } from './client.js'
import { getCutLuyConfig } from './config.js'
import { CutLuyError } from './errors.js'
import { verifyWebhookSignature } from './signature.js'
import type { CutLuyPayment, CutLuyWebhookEvent } from './types.js'

/** Provider statuses we accept (CutLuy may return "scanned"). */
const VALID_STATUSES = new Set(['pending', 'scanned', 'paid', 'expired', 'failed'])

const WEBHOOK_STATUS_MAP: Record<string, ProviderWebhookEvent['status']> = {
  'payment.completed': 'paid',
  'payment.scanned': 'scanned',
  'payment.expired': 'expired',
  'payment.failed': 'failed',
}

/**
 * Normalises a raw CutLuy webhook body into the provider-agnostic
 * `ProviderWebhookEvent` the core payment service consumes. Pure and
 * signature-independent so the webhook route (which verifies the HMAC
 * itself and logs rejections) can reuse it.
 */
export function normalizeCutLuyEvent(rawBody: Buffer): ProviderWebhookEvent {
  const parsed = JSON.parse(rawBody.toString('utf8')) as CutLuyWebhookEvent
  const status = WEBHOOK_STATUS_MAP[parsed.type] ?? 'pending'
  return {
    type: parsed.type,
    eventId: parsed.id,
    providerPaymentId: parsed.data?.payment?.id ?? '',
    status,
    raw: parsed as unknown as Record<string, unknown>,
  }
}

/**
 * Real CutLuy (Bakong KHQR) provider.
 *
 * - createPayment  → POST /v1/payments, returns raw qr_string + checkout_url
 * - getPayment     → GET /v1/payments/:id (polling fallback to webhooks)
 * - verifyWebhook  → HMAC-SHA256 signature check against the RAW body
 * - refund         → not exposed by CutLuy yet; throws a clear error
 */
export class CutLuyPaymentProvider implements PaymentProvider {
  readonly name = 'cutluy'

  async createPayment(input: CreatePaymentInput): Promise<PaymentResult> {
    const { apiKey, apiUrl } = getCutLuyConfig()
    if (!apiKey) {
      throw new CutLuyError('unauthorized', 'CUTLUY_API_KEY is not configured', 503)
    }
    const client = new CutLuyClient(apiUrl, apiKey)

    // referenceId doubles as the idempotency key so retries never double-charge.
    const payment = await client.createPayment({
      amount: input.amount,
      reference_id: input.referenceId,
      metadata: input.metadata ?? {},
      idempotency_key: input.referenceId,
    })

    return {
      providerPaymentId: payment.id,
      status: 'pending',
      qrString: payment.qr_string,
      checkoutUrl: payment.checkout_url,
      expiresAt: new Date(payment.expires_at),
    }
  }

  async getPayment(providerPaymentId: string): Promise<ProviderPaymentStatus> {
    const { apiKey, apiUrl } = getCutLuyConfig()
    if (!apiKey) {
      throw new CutLuyError('unauthorized', 'CUTLUY_API_KEY is not configured', 503)
    }
    const payment = await new CutLuyClient(apiUrl, apiKey).getPayment(providerPaymentId)
    return mapCutLuyPayment(payment)
  }

  async refund(_providerPaymentId: string, _amount?: number): Promise<ProviderRefundResult> {
    // CutLuy does not expose a refund endpoint in its public API.
    throw new CutLuyError('invalid_request', 'Refunds are not supported by CutLuy yet', 501)
  }

  verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): ProviderWebhookEvent {
    const header = firstHeader(headers['x-cutluy-signature'])
    const { webhookSecret } = getCutLuyConfig()
    if (!webhookSecret) {
      // Fail closed — never accept unverifiable webhooks.
      throw new CutLuyError(
        'invalid_request',
        'CUTLUY_WEBHOOK_SECRET is not configured — cannot verify webhooks',
        503,
      )
    }
    const { valid, reason } = verifyWebhookSignature(rawBody, header, webhookSecret)
    if (!valid) {
      throw new CutLuyError('invalid_request', `Invalid webhook signature: ${reason ?? 'unknown'}`, 400)
    }

    return normalizeCutLuyEvent(rawBody)
  }
}

export function mapCutLuyPayment(payment: CutLuyPayment): ProviderPaymentStatus {
  const status = VALID_STATUSES.has(payment.status)
    ? (payment.status as ProviderPaymentStatus['status'])
    : 'pending'
  return {
    status,
    approvedAt: payment.approved_at ? new Date(payment.approved_at) : null,
    amount: Number(payment.amount) || 0,
  }
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}
