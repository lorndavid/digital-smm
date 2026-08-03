/**
 * ABA PayWay Payment Gateway API types.
 *
 * Base: https://checkout.payway.com.kh/api/payment-gateway/v1/payments
 * Auth: merchant_id + an HMAC-SHA512 `hash` of the request fields, signed
 * with the merchant API key. Exact field names should be verified against
 * the ABA PayWay merchant dashboard before going live.
 */

export interface AbaPurchaseResponse {
  status: { code: string; message: string }
  /** Redirect the customer to this hosted page. */
  payment_url?: string
  tran_id?: string
}

export interface AbaCheckPaymentResponse {
  status: { code: string; message: string }
  tran_id?: string
  amount?: string
  last_updated?: string
}

/** Success code returned by the ABA gateway. */
export const ABA_SUCCESS_CODE = '0000'
