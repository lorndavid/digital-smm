import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * ABA PayWay signs requests and IPN payloads with HMAC-SHA512 using the
 * merchant API key. The string to hash is a concatenation of specific
 * fields (see the individual helpers below).
 */

export function signHmac512(secret: string, data: string): string {
  return createHmac('sha512', secret).update(data).digest('hex')
}

/** Purchase request hash: tran_id + amount + items + merchant_id. */
export function purchaseHash(
  apiKey: string,
  tranId: string,
  amount: string,
  merchantId: string,
  items = '',
): string {
  return signHmac512(apiKey, `${tranId}${amount}${items}${merchantId}`)
}

/** Check-payment request hash: tran_id + merchant_id. */
export function checkPaymentHash(apiKey: string, tranId: string, merchantId: string): string {
  return signHmac512(apiKey, `${tranId}${merchantId}`)
}

/** IPN verification hash: tran_id + amount + merchant_id. */
export function ipnHash(apiKey: string, tranId: string, amount: string, merchantId: string): string {
  return signHmac512(apiKey, `${tranId}${amount}${merchantId}`)
}

/** Constant-time comparison of two hex digests. */
export function hashesMatch(expected: string, received: string): boolean {
  const a = Buffer.from(expected, 'hex')
  const b = Buffer.from(received, 'hex')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
