/**
 * Mock Bakong KHQR builder.
 *
 * Produces a deterministic, scannable placeholder payload so the payment
 * UI can render a QR code today. When integrating the real Bakong KHQR
 * SDK, replace the body of `buildMockKhqr` with the official generator
 * (bakong-khqr) — the rest of the pipeline stays untouched.
 */
export function buildMockKhqr(input: {
  merchant: string
  reference: string
  amount: number
  currency: string
}): string {
  const payload = [
    'KHQR',
    `merchant=${input.merchant}`,
    `ref=${input.reference}`,
    `amount=${input.amount.toFixed(2)}`,
    `currency=${input.currency}`,
    'bank=BAKONG',
    'acquirer=ABA',
  ].join('|')
  // Simple base64 so the QR content is a compact, stable string.
  return Buffer.from(payload, 'utf8').toString('base64url')
}
