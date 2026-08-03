import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * CutLuy webhook signature verification.
 *
 * Header: `X-CutLuy-Signature: t=<unix>,v1=<hex>`. The signature is
 * HMAC-SHA256 of `${t}.${rawBody}` using the endpoint's signing secret.
 * We compare in constant time and reject events with an old timestamp to
 * prevent replay attacks.
 */
export interface SignatureParts {
  t: number
  v1: string
}

/** Parses a "k=v,k=v" signature header. Throws when malformed. */
export function parseSignatureHeader(header: string): SignatureParts {
  const parts: Record<string, string> = {}
  for (const pair of header.split(',')) {
    const eq = pair.indexOf('=')
    if (eq === -1) continue
    parts[pair.slice(0, eq)] = pair.slice(eq + 1)
  }
  const t = Number(parts.t)
  const v1 = parts.v1
  if (!Number.isFinite(t) || !v1) {
    throw new Error('Malformed CutLuy signature header')
  }
  return { t, v1 }
}

/** Constant-time hex comparison. */
export function signaturesMatch(expected: string, received: string): boolean {
  const a = Buffer.from(expected, 'hex')
  const b = Buffer.from(received, 'hex')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export interface SignatureVerificationResult {
  valid: boolean
  reason?: string
}

/**
 * Verifies the signature of a raw webhook body.
 *
 * @param rawBody   the RAW request body (never the parsed JSON).
 * @param header    the X-CutLuy-Signature header value.
 * @param secret    the webhook signing secret.
 * @param nowSec    current unix time in seconds (injectable for tests).
 */
export function verifyWebhookSignature(
  rawBody: Buffer,
  header: string | undefined,
  secret: string,
  nowSec = Math.floor(Date.now() / 1000),
): SignatureVerificationResult {
  if (!header) return { valid: false, reason: 'missing signature header' }
  if (!secret) return { valid: false, reason: 'webhook secret not configured' }

  let parts: SignatureParts
  try {
    parts = parseSignatureHeader(header)
  } catch {
    return { valid: false, reason: 'malformed signature header' }
  }

  // Replay protection: reject timestamps older than 5 minutes.
  if (Math.abs(nowSec - parts.t) > 300) {
    return { valid: false, reason: 'signature timestamp too old (replay?)' }
  }

  const expected = createHmac('sha256', secret)
    .update(`${parts.t}.${rawBody.toString('utf8')}`)
    .digest('hex')

  if (!signaturesMatch(expected, parts.v1)) {
    return { valid: false, reason: 'signature mismatch' }
  }
  return { valid: true }
}
