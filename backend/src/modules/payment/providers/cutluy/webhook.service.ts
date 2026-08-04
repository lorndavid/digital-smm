import { getCutLuyConfig } from './config.js'
import { verifyWebhookSignature } from './signature.js'
import { normalizeCutLuyEvent } from './payment.service.js'
import type { CutLuyWebhookEvent } from './types.js'
import { WebhookLogModel } from '../../../../models/webhook-log.model.js'
import { paymentService } from '../../../../services/payment.service.js'
import { logger } from '../../../../utils/logger.js'

export interface WebhookHandleResult {
  valid: boolean
  outcome: 'processed' | 'duplicate' | 'ignored' | 'invalid' | 'error'
  eventId?: string
  reason?: string
}

/**
 * Processes an incoming CutLuy webhook:
 *  1. Verify the HMAC-SHA256 signature against the RAW body.
 *  2. Log every delivery to the webhook_logs collection (audit).
 *  3. Dispatch the normalised event to the core payment service, which
 *     updates the payment, fulfils the order (creates the SMMWiz order)
 *     and emits the SSE status event — all idempotently.
 *
 * Always acknowledge valid events with 2xx so CutLuy stops retrying.
 */
export async function handleCutLuyWebhook(
  rawBody: Buffer,
  headers: Record<string, string | string[] | undefined>,
): Promise<WebhookHandleResult> {
  const signatureHeader = Array.isArray(headers['x-cutluy-signature'])
    ? headers['x-cutluy-signature'][0]
    : headers['x-cutluy-signature']

  const { webhookSecret } = getCutLuyConfig()
  const verification = verifyWebhookSignature(rawBody, signatureHeader, webhookSecret)

  if (!verification.valid) {
    logger.warn(`[cutluy-webhook] rejected: ${verification.reason}`)
    // Still record the attempt for audit.
    await WebhookLogModel.create({
      provider: 'cutluy',
      type: 'unknown',
      signatureValid: false,
      payload: {},
      outcome: 'invalid',
      error: verification.reason ?? 'invalid signature',
    }).catch(() => undefined)
    return { valid: false, outcome: 'invalid', reason: verification.reason }
  }

  // Normalise the raw CutLuy payload into the provider-agnostic event the
  // core payment service expects (providerPaymentId + status at top level).
  const event = normalizeCutLuyEvent(rawBody)
  const eventId = event.eventId ?? ''
  // The reference_id is nested under data.payment in the raw payload.
  const referenceId =
    (event.raw as unknown as CutLuyWebhookEvent).data?.payment?.reference_id ?? ''

  // Dedupe: ignore already-processed events (webhooks retry up to 8 times).
  if (eventId) {
    const existing = await WebhookLogModel.exists({ provider: 'cutluy', eventId }).exec()
    if (existing) {
      return { valid: true, outcome: 'duplicate', eventId }
    }
  }

  try {
    const result = await paymentService.handleProviderWebhook({
      provider: 'cutluy',
      providerPaymentId: event.providerPaymentId,
      referenceId: referenceId || undefined,
      event,
    })
    // An event for a payment we don't know is genuinely not ours —
    // acknowledge so CutLuy stops retrying. Everything else: processed.
    const outcome = result.payment ? 'processed' : 'ignored'
    await WebhookLogModel.create({
      provider: 'cutluy',
      eventId,
      type: event.type ?? 'unknown',
      signatureValid: true,
      payload: event.raw,
      outcome,
      processedAt: new Date(),
    })
    return { valid: true, outcome, eventId }
  } catch (err) {
    // Genuine processing failure (e.g. DB hiccup, provider placement error):
    // RE-THROW so the route returns non-2xx and CutLuy retries the delivery
    // with exponential backoff (up to 8 times).
    const message = err instanceof Error ? err.message : 'processing failed'
    logger.error('[cutluy-webhook] processing failed', err)
    await WebhookLogModel.create({
      provider: 'cutluy',
      eventId,
      type: event.type ?? 'unknown',
      signatureValid: true,
      payload: event.raw,
      outcome: 'error',
      error: message,
      processedAt: new Date(),
    })
    throw err
  }
}

/** Re-exported for the route layer; keeps the HTTP status mapping in one place. */
export function webhookHttpStatus(result: WebhookHandleResult): number {
  return result.valid ? 200 : 400
}
