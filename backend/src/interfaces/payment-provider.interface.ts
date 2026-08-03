/**
 * Contract for a payment provider.
 *
 * The interface is intentionally small and provider-agnostic so real
 * Cambodian payment rails (CutLuy/Bakong KHQR, ABA PayWay, Bakong API,
 * ACLEDA, Wing) can be plugged in without touching order/payment
 * orchestration. Swap the active provider via `PAYMENT_PROVIDER` in env.
 */
export interface CreatePaymentInput {
  /** Amount in the payment currency (always positive). */
  amount: number
  currency: string
  /** Our unique internal reference, e.g. "PAY-AB12CD34EF56". */
  referenceId: string
  /** Optional human readable description shown to the customer. */
  description?: string
  /** Arbitrary metadata echoed back by the provider / webhooks. */
  metadata?: Record<string, unknown>
}

/** What the user needs to actually pay (QR payload and/or hosted checkout). */
export interface PaymentResult {
  /** Provider-side payment id, used later by getPayment / webhooks. */
  providerPaymentId: string
  status: 'pending'
  /** Raw KHQR (EMV) payload when the provider renders its own QR. */
  qrString?: string
  /** QR rendered as a data URL (computed server side when qrString given). */
  qrCodeDataUrl?: string
  /** Hosted branded checkout page URL (CutLuy) or redirect URL (ABA). */
  checkoutUrl?: string
  expiresAt: Date
}

/** Normalised provider-side payment status (polling path). */
export interface ProviderPaymentStatus {
  status: 'pending' | 'scanned' | 'paid' | 'expired' | 'failed'
  approvedAt?: Date | null
  amount?: number
}

export interface ProviderRefundResult {
  refunded: boolean
  providerRefundId?: string
}

/** A verified provider webhook event, normalised across providers. */
export interface ProviderWebhookEvent {
  /** Provider event type, e.g. "payment.completed". */
  type: string
  /** Provider event id (dedupe). */
  eventId?: string
  /** The provider payment id this event refers to. */
  providerPaymentId: string
  /** Normalised status implied by the event. */
  status: 'pending' | 'scanned' | 'paid' | 'expired' | 'failed'
  /** Raw payload for the webhook log. */
  raw: Record<string, unknown>
}

export interface PaymentProvider {
  readonly name: string
  /** Creates a pending payment and returns everything the user needs. */
  createPayment(input: CreatePaymentInput): Promise<PaymentResult>
  /** Fetches the current provider-side status (polling / verification). */
  getPayment(providerPaymentId: string): Promise<ProviderPaymentStatus>
  /** Refunds a settled payment when the provider supports it. */
  refund(providerPaymentId: string, amount?: number): Promise<ProviderRefundResult>
  /**
   * Verifies a provider webhook (signature / hash) against the RAW body and
   * returns a normalised event. Throws when the signature is invalid.
   */
  verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): ProviderWebhookEvent
}
