import type { AbaCheckPaymentResponse, AbaPurchaseResponse } from './types.js'
import { checkPaymentHash, purchaseHash } from './hash.js'
import type { AbaPayWayConfig } from './config.js'

/**
 * ABA PayWay client — hosted checkout (redirect) flow.
 *
 * The customer is redirected to `payment_url`, pays on ABA's branded page,
 * and ABA redirects back (return_url) and/or POSTs an IPN webhook.
 */
export class AbaPayWayClient {
  constructor(private readonly config: AbaPayWayConfig) {}

  private async post<T>(path: string, body: Record<string, string>): Promise<T> {
    const res = await fetch(`${this.config.apiUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
      signal: AbortSignal.timeout(30_000),
    })
    const json = (await res.json()) as T
    return json
  }

  /** Creates a purchase and returns the hosted checkout URL. */
  async purchase(input: {
    tranId: string
    amount: string
    firstName?: string
    lastName?: string
    phone?: string
    email?: string
  }): Promise<AbaPurchaseResponse> {
    const { merchantId, apiKey, returnUrl } = this.config
    const hash = purchaseHash(apiKey, input.tranId, input.amount, merchantId)
    return this.post<AbaPurchaseResponse>('/purchase', {
      merchant_id: merchantId,
      tran_id: input.tranId,
      amount: input.amount,
      currency: 'USD',
      hash,
      type: 'purchase',
      payment_option: 'cards',
      firstname: input.firstName ?? '',
      lastname: input.lastName ?? '',
      phone: input.phone ?? '',
      email: input.email ?? '',
      return_url: returnUrl,
      continue_success_url: returnUrl,
    })
  }

  /** Checks the status of a transaction by tran_id. */
  async checkPayment(tranId: string): Promise<AbaCheckPaymentResponse> {
    const { merchantId, apiKey } = this.config
    const hash = checkPaymentHash(apiKey, tranId, merchantId)
    return this.post<AbaCheckPaymentResponse>('/check-payment', {
      merchant_id: merchantId,
      tran_id: tranId,
      hash,
    })
  }
}
