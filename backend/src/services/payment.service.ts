import { randomUUID } from 'node:crypto'
import type { Types } from 'mongoose'
import type { PaymentProvider as PaymentProviderName, PaymentPurpose } from '../types/index.js'
import type {
  PaymentProvider,
  ProviderPaymentStatus,
  ProviderWebhookEvent,
} from '../interfaces/payment-provider.interface.js'
import { getPaymentProvider } from './payment/payment.factory.js'
import { renderQrDataUrl } from './payment/qr.util.js'
import { emitPaymentStatus } from './payment/events.bus.js'
import { providerSyncCache } from './payment/provider-sync-cache.js'
import { paymentRepository } from '../repositories/finance.repository.js'
import { orderRepository } from '../repositories/order.repository.js'
import { walletService } from './wallet.service.js'
import { orderService } from './order.service.js'
import { ApiError } from '../utils/api-error.js'
import { logger } from '../utils/logger.js'
import type { PaymentDoc } from '../models/payment.model.js'
import { PaymentModel } from '../models/payment.model.js'
import type { OrderDoc } from '../models/order.model.js'

export interface CreatePaymentOptions {
  purpose: PaymentPurpose
  amount?: number
  serviceId?: string
  /** Reuse an existing pending order instead of creating a new one. */
  orderId?: string
  link?: string
  quantity?: number
  params?: Record<string, unknown>
}

const round2 = (n: number) => Math.round(n * 100) / 100

function makeReference(): string {
  return `PAY-${randomUUID().slice(0, 12).toUpperCase()}`
}

/**
 * Payment orchestration (new flow):
 *
 *  1. createPayment → creates the local Order (status 'Pending Payment')
 *     when the purpose is 'order', then a Payment doc, then calls the
 *     provider (CutLuy etc.) to generate the QR / hosted checkout.
 *  2. Webhook or polling → provider status 'paid' → fulfillPayment marks
 *     the payment paid (atomic, idempotent), credits the wallet (topup)
 *     or places the SMMWiz order (order).
 *  3. Every state change is emitted on the SSE bus so the payment page
 *     updates in real time.
 */
export class PaymentService {
  private readonly provider: PaymentProvider = getPaymentProvider()

  // ---------------------------------------------------------------------
  // Creation
  // ---------------------------------------------------------------------

  async createPayment(userId: string, options: CreatePaymentOptions) {
    let amount: number
    let order: OrderDoc | null = null

    if (options.purpose === 'topup') {
      if (!options.amount || !(options.amount > 0)) {
        throw new ApiError(400, 'Top-up amount is required')
      }
      amount = round2(options.amount)
    } else {
      if (options.orderId) {
        // Reuse an existing pending order (retry after expiry).
        order = await orderService.getOrderForUser(userId, options.orderId)
        if (order.status !== 'Pending Payment') {
          throw new ApiError(400, 'This order cannot be paid for anymore')
        }
        const existing = await paymentRepository.findPendingForOrder(order._id.toString())
        if (existing) {
          const orderForUser = await orderService.getOrderForUser(userId, options.orderId)
          return { payment: existing, order: orderForUser }
        }
        amount = order.totalPrice
      } else {
        if (!options.serviceId) throw new ApiError(400, 'serviceId is required for order payments')
        const created = await orderService.createPendingOrder(userId, {
          serviceId: options.serviceId,
          link: options.link,
          quantity: options.quantity,
          params: options.params ?? {},
        })
        order = created.order
        amount = created.totalPrice
      }
    }

    // KHQR providers (CutLuy) enforce a minimum charge of $0.01 USD. Real
    // SMMWiz per-unit rates are tiny, so small-quantity orders can total less
    // than that. Fail fast with a clear message instead of a provider 400.
    if (amount < 0.01) {
      throw new ApiError(
        400,
        options.purpose === 'topup'
          ? 'Minimum top-up is $0.01 USD'
          : 'Order total is below the $0.01 USD minimum — increase the quantity',
      )
    }

    const referenceId = makeReference()
    const metadata: Record<string, unknown> =
      options.purpose === 'topup'
        ? {}
        : {
            serviceId: order ? order.service.toString() : options.serviceId,
            link: order?.link,
            quantity: order?.quantity,
            params: order?.params ?? {},
          }

    const startedAt = Date.now()
    let result: Awaited<ReturnType<PaymentProvider['createPayment']>>
    try {
      result = await this.provider.createPayment({
        amount,
        currency: 'USD',
        referenceId,
        description: options.purpose === 'topup' ? 'Wallet top-up' : 'Service order',
        metadata,
      })
      logger.info('[payment] createPayment provider ok', {
        reference: referenceId,
        provider: this.provider.name,
        purpose: options.purpose,
        amount,
        duration_ms: Date.now() - startedAt,
        result: 'success',
      })
    } catch (err) {
      logger.error('[payment] createPayment provider failed', {
        reference: referenceId,
        provider: this.provider.name,
        purpose: options.purpose,
        amount,
        duration_ms: Date.now() - startedAt,
        result: 'error',
        error: err instanceof Error ? err.message : String(err),
      })
      throw err
    }

    const payment = await paymentRepository.create({
      user: userId as unknown as Types.ObjectId,
      order: order ? order._id : null,
      provider: this.provider.name as PaymentProviderName,
      method: this.provider.name === 'abapayway' ? 'ABA' : 'KHQR',
      purpose: options.purpose,
      status: 'pending',
      // The provider amount (already rounded) — required by the Payment model.
      amount,
      referenceId,
      idempotencyKey: referenceId,
      providerPaymentId: result.providerPaymentId,
      qrString: result.qrString ?? '',
      qrCodeDataUrl: result.qrCodeDataUrl ?? (result.qrString ? await renderQrDataUrl(result.qrString) : ''),
      checkoutUrl: result.checkoutUrl ?? '',
      metadata,
      approvedAt: null,
      expiresAt: result.expiresAt,
    })

    emitPaymentStatus({
      referenceId,
      status: 'pending',
      orderId: order ? order._id.toString() : null,
    })

    const orderOut = order ? await orderService.getOrderForUser(userId, order._id.toString()) : null
    return { payment, order: orderOut }
  }

  // ---------------------------------------------------------------------
  // Status / polling
  // ---------------------------------------------------------------------

  private async getOwnedPayment(userId: string, referenceId: string): Promise<PaymentDoc> {
    const payment = await paymentRepository.findByReferenceId(referenceId)
    if (!payment) throw new ApiError(404, 'Payment not found')
    if (payment.user.toString() !== userId) {
      throw new ApiError(403, 'Payment belongs to another user')
    }
    return payment
  }

  /**
   * Light status read + provider sync. Used by polling and the payment page.
   */
  async status(userId: string, referenceId: string, forceProviderCheck = false) {
    const payment = await this.getOwnedPayment(userId, referenceId)

    if (forceProviderCheck || !isTerminal(payment.status)) {
      await this.syncProviderStatus(payment, forceProviderCheck)
    }

    const order = payment.order
      ? await orderService.getOrderForUser(userId, payment.order.toString())
      : null
    return { payment, order }
  }

  /** Verifies settlement against the provider and fulfils when paid. */
  async verify(userId: string, referenceId: string) {
    return this.status(userId, referenceId, true)
  }

  private async syncProviderStatus(payment: PaymentDoc, force = false): Promise<void> {
    if (!payment.providerPaymentId) return
    // Throttle provider API calls per payment (see provider-sync-cache.ts).
    // Every payment page polls ~every 3s; 100 users would otherwise hit
    // CutLuy ~20–33×/s. Instant pushes still arrive via webhook → SSE.
    // `force` (the customer's explicit verify / page reload) BYPASSES the
    // throttle: when the user returns from scanning, or reloads after
    // paying, we must hit the provider NOW — a stale cached 'pending'
    // otherwise leaves the page stuck on the KHQR even though the bank
    // app already settled the charge.
    if (!force && !providerSyncCache.isDue(payment._id.toString())) return
    let providerStatus: ProviderPaymentStatus
    const startedAt = Date.now()
    try {
      providerStatus = await this.provider.getPayment(payment.providerPaymentId)
      logger.info('[payment] provider status check ok', {
        reference: payment.referenceId,
        provider: this.provider.name,
        status: providerStatus.status,
        duration_ms: Date.now() - startedAt,
        result: 'success',
      })
    } catch (err) {
      logger.warn('[payment] provider status check failed', {
        reference: payment.referenceId,
        provider: this.provider.name,
        duration_ms: Date.now() - startedAt,
        result: 'error',
        error: err instanceof Error ? err.message : String(err),
      })
      return
    }
    // Record only after a SUCCESSFUL call — transient provider errors retry
    // immediately instead of being throttled for the full TTL.
    providerSyncCache.markSynced(payment._id.toString())
    await this.applyProviderStatus(payment, providerStatus)
  }

  // ---------------------------------------------------------------------
  // Fulfilment (idempotent)
  // ---------------------------------------------------------------------

  /**
   * Applies a provider status to a payment. Only status transitions are
   * written; paid payments go through fulfillPayment which claims the
   * payment atomically so webhook + polling can never double-charge.
   */
  private async applyProviderStatus(
    payment: PaymentDoc,
    providerStatus: ProviderPaymentStatus,
  ): Promise<void> {
    const next = providerStatus.status
    if (next === payment.status) {
      // Retry SMM placement for paid orders that failed earlier.
      if (payment.status === 'paid' && payment.purpose === 'order' && payment.order) {
        await this.retryOrderPlacement(payment)
      }
      return
    }

    if (next === 'paid') {
      await this.fulfillPayment(payment)
      return
    }

    if (['scanned', 'expired', 'failed'].includes(next)) {
      payment.status = next
      if (providerStatus.approvedAt) payment.approvedAt = providerStatus.approvedAt
      await payment.save()
      emitPaymentStatus({
        referenceId: payment.referenceId,
        status: payment.status,
        orderId: payment.order ? payment.order.toString() : null,
      })
    }
  }

  /** Atomic claim + settle. Webhook and polling both funnel through here. */
  private async fulfillPayment(payment: PaymentDoc): Promise<{ payment: PaymentDoc; order: OrderDoc | null }> {
    // Claim the transition pending/scanned → paid exactly once.
    const claimed = await PaymentModel.updateOne(
      { _id: payment._id, status: { $in: ['pending', 'scanned'] } },
      { $set: { status: 'paid', approvedAt: new Date() } },
    ).exec()

    if (claimed.modifiedCount === 0) {
      // Already paid or terminal — re-check SMM placement for order purposes.
      if (payment.purpose === 'order' && payment.order) {
        await this.retryOrderPlacement(payment)
      }
      const fresh = await paymentRepository.findById(payment._id.toString())
      const order = payment.order
        ? await this.loadOrderForFulfillment(payment.order.toString())
        : null
      return { payment: fresh ?? payment, order }
    }

    logger.info('[payment] fulfilled', {
      reference: payment.referenceId,
      provider: this.provider.name,
      purpose: payment.purpose,
      amount: payment.amount,
      orderId: payment.order ? payment.order.toString() : null,
      result: 'success',
    })

    payment.status = 'paid'
    payment.approvedAt = new Date()

    let order: OrderDoc | null = null
    if (payment.purpose === 'topup') {
      await walletService.credit(
        payment.user.toString(),
        payment.amount,
        `Wallet top-up ${payment.referenceId}`,
        'topup',
      )
    } else if (payment.order) {
      try {
        order = await orderService.fulfillPendingOrder(payment.order, payment._id)
      } catch (err) {
        // Order marked 'Paid'; a later poll/webhook retries placement.
        logger.error(`[payment] SMM placement failed for ${payment.referenceId}`, err)
      }
    }

    await payment.save()
    emitPaymentStatus({
      referenceId: payment.referenceId,
      status: 'paid',
      orderId: payment.order ? payment.order.toString() : null,
      orderStatus: order?.status ?? null,
      approvedAt: payment.approvedAt.toISOString(),
    })
    return { payment, order }
  }

  /** Retries SMM placement for an already-paid order that failed earlier. */
  private async retryOrderPlacement(payment: PaymentDoc): Promise<void> {
    if (!payment.order) return
    try {
      const order = await orderService.fulfillPendingOrder(payment.order, payment._id)
      if (order.status === 'Processing') {
        emitPaymentStatus({
          referenceId: payment.referenceId,
          status: 'paid',
          orderId: order._id.toString(),
          orderStatus: 'Processing',
        })
      }
    } catch (err) {
      logger.warn(`[payment] order placement retry failed for ${payment.referenceId}`)
    }
  }

  private async loadOrderForFulfillment(orderId: string): Promise<OrderDoc | null> {
    try {
      return await orderRepository.findById(orderId)
    } catch {
      return null
    }
  }

  // ---------------------------------------------------------------------
  // Webhook handling
  // ---------------------------------------------------------------------

  /**
   * Processes a normalised provider webhook event. Looks the payment up by
   * providerPaymentId (falling back to our referenceId) and applies the
   * implied status. Idempotent — repeated/retried events are no-ops.
   */
  async handleProviderWebhook(input: {
    provider: string
    providerPaymentId?: string
    referenceId?: string
    event: ProviderWebhookEvent | Record<string, unknown>
  }): Promise<{ payment: PaymentDoc | null; order: OrderDoc | null }> {
    const event = input.event as ProviderWebhookEvent
    let payment: PaymentDoc | null = null

    if (event.providerPaymentId) {
      payment = await paymentRepository.findByProviderPaymentId(event.providerPaymentId)
    }
    if (!payment && input.referenceId) {
      payment = await paymentRepository.findByReferenceId(input.referenceId)
    }
    if (!payment) {
      logger.warn('[payment] webhook for unknown payment', {
        provider: input.provider,
        event: event.type,
        reference: input.referenceId ?? null,
        result: 'ignored',
      })
      return { payment: null, order: null }
    }

    logger.info('[payment] webhook processed', {
      reference: payment.referenceId,
      provider: input.provider,
      event: event.type,
      status: event.status,
      result: 'processed',
    })

    await this.applyProviderStatus(payment, { status: event.status })
    const order = payment.order ? await this.loadOrderForFulfillment(payment.order.toString()) : null
    return { payment, order }
  }

  // ---------------------------------------------------------------------
  // Customer actions
  // ---------------------------------------------------------------------

  /** Cancels a pending payment and its pending order (user abandoned). */
  async cancel(userId: string, referenceId: string) {
    const payment = await this.getOwnedPayment(userId, referenceId)
    if (!['pending', 'scanned'].includes(payment.status)) {
      throw new ApiError(400, 'Only pending payments can be cancelled')
    }

    payment.status = 'expired'
    await payment.save()

    if (payment.purpose === 'order' && payment.order) {
      const order = await orderService.getOrderForUser(userId, payment.order.toString())
      if (order.status === 'Pending Payment') {
        order.status = 'Cancelled'
        await order.save()
      }
    }

    emitPaymentStatus({
      referenceId: payment.referenceId,
      status: 'expired',
      orderId: payment.order ? payment.order.toString() : null,
    })
    return this.status(userId, referenceId)
  }

  /** Creates a fresh payment for an existing pending order (new QR). */
  async retry(userId: string, orderId: string) {
    return this.createPayment(userId, { purpose: 'order', orderId })
  }

  async paymentsForUser(userId: string, page: number, limit: number) {
    const [items, total] = await paymentRepository.listByUser(userId, page, limit)
    return { items, total, page, limit }
  }
}

function isTerminal(status: string): boolean {
  return ['paid', 'expired', 'failed', 'refunded'].includes(status)
}

export const paymentService = new PaymentService()
