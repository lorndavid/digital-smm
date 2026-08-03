/**
 * CutLuy API types (https://cutluy.com).
 *
 * REST API v1, Bearer auth, amounts in USD. Payment lifecycle:
 *   pending → scanned → paid | expired | failed
 */

export interface CutLuyCreatePaymentRequest {
  /** Amount to charge, in USD. Minimum 0.01. */
  amount: number
  /** Our own order id (≤255 chars). Echoed back and included in webhooks. */
  reference_id?: string
  /** Arbitrary JSON, returned as-is on the payment. */
  metadata?: Record<string, unknown>
  /** Safely retry without creating duplicates (≤255). */
  idempotency_key?: string
}

export interface CutLuyPayment {
  id: string
  /** pending | scanned | paid | expired | failed */
  status: string
  /** Decimal string, e.g. "1.50". */
  amount: string
  currency: string
  reference_id: string | null
  /** Raw KHQR (EMV) payload — render as a QR for scan-to-pay. */
  qr_string: string
  /** Hosted branded checkout page. */
  checkout_url: string
  metadata: Record<string, unknown> | null
  /** ISO 8601 time the payment was paid. */
  approved_at: string | null
  created_at: string
  /** ~5 minutes after creation. */
  expires_at: string
}

/** CutLuy webhook events. */
export type CutLuyWebhookEventType =
  | 'payment.completed'
  | 'payment.scanned'
  | 'payment.expired'
  | 'payment.failed'

export interface CutLuyWebhookEvent {
  id: string
  type: CutLuyWebhookEventType
  created: string
  data: {
    payment: {
      id: string
      status: string
      amount: string
      currency: string
      reference_id: string | null
      metadata: Record<string, unknown> | null
      approved_at: string | null
    }
  }
}

/** CutLuy error payloads. */
export type CutLuyErrorCode =
  | 'unauthorized'
  | 'quota_exceeded'
  | 'invalid_request'
  | 'amount_too_low'
  | 'amount_too_high'
  | 'payment_link_not_found'
  | 'payment_link_disabled'
  | 'payment_not_found'
  | 'method_not_allowed'
  | 'payment_provider_error'

export interface CutLuyErrorBody {
  error: CutLuyErrorCode
  message: string
}
