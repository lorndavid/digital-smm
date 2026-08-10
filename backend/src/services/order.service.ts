import type { Types } from 'mongoose'
import { ServiceType } from '../types/index.js'
import type { CreateOrderInput } from '../interfaces/smm-provider.interface.js'
import { orderRepository } from '../repositories/order.repository.js'
import { serviceRepository, type ServiceDoc } from '../repositories/catalog.repository.js'
import { paymentRepository } from '../repositories/finance.repository.js'
import { OrderModel, type OrderDoc } from '../models/order.model.js'
import { getSmmProvider } from './smm/provider.factory.js'
import { walletService } from './wallet.service.js'
import { emitPaymentStatus } from './payment/events.bus.js'
import { ApiError } from '../utils/api-error.js'

export interface OrderDraft {
  serviceId: string
  link?: string
  quantity?: number
  params?: Record<string, unknown>
}

const round2 = (n: number) => Math.round(n * 100) / 100

const asString = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined

const asNumber = (v: unknown): number | undefined => {
  if (typeof v === 'number') return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

const asList = (v: unknown): string[] | undefined => {
  if (Array.isArray(v)) return v.map(String).filter(Boolean)
  if (typeof v === 'string')
    return v
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
  return undefined
}

/**
 * Maps a validated draft onto the provider payload for the service type,
 * enforcing the type-specific required fields from the provider guide.
 */
/**
 * True when the service is fulfilled manually by the shop owner instead of
 * being sent to the SMM provider. Manual services have no providerServiceId;
 * the order is created locally and marked Processing for the admin to fulfill.
 */
function isManualService(service: ServiceDoc): boolean {
  return service.provider === 'manual' || service.providerServiceId == null
}

function buildProviderInput(service: ServiceDoc, draft: OrderDraft): CreateOrderInput {
  const base: CreateOrderInput = { service: service.providerServiceId ?? 0 }
  const p = draft.params ?? {}
  const link = asString(draft.link)
  const quantity = asNumber(draft.quantity)

  switch (service.type) {
    case ServiceType.Default:
      if (!link) throw new ApiError(400, 'Link is required')
      if (!quantity) throw new ApiError(400, 'Quantity is required')
      return {
        ...base,
        link,
        quantity,
        runs: asNumber(p.runs),
        interval: asNumber(p.interval),
      }

    case ServiceType.Package:
      if (!link) throw new ApiError(400, 'Link is required')
      return { ...base, link }

    case ServiceType.SEO:
      if (!link) throw new ApiError(400, 'Link is required')
      if (!quantity) throw new ApiError(400, 'Quantity is required')
      return { ...base, link, quantity, keywords: asList(p.keywords) }

    case ServiceType.CustomComments:
    case ServiceType.CustomCommentsPackage: {
      if (!link) throw new ApiError(400, 'Link is required')
      const comments = asList(p.comments)
      if (!comments?.length) throw new ApiError(400, 'Comments list is required')
      return { ...base, link, comments }
    }

    case ServiceType.Mentions: {
      if (!link) throw new ApiError(400, 'Link is required')
      if (!quantity) throw new ApiError(400, 'Quantity is required')
      const usernames = asList(p.usernames)
      if (!usernames?.length) throw new ApiError(400, 'Usernames list is required')
      return { ...base, link, quantity, usernames }
    }

    case ServiceType.MentionsUserFollowers: {
      if (!link) throw new ApiError(400, 'Link is required')
      if (!quantity) throw new ApiError(400, 'Quantity is required')
      const username = asString(p.username)
      if (!username) throw new ApiError(400, 'Username (URL to scrape followers from) is required')
      return { ...base, link, quantity, username }
    }

    case ServiceType.CommentLikes: {
      if (!link) throw new ApiError(400, 'Link is required')
      if (!quantity) throw new ApiError(400, 'Quantity is required')
      const username = asString(p.username)
      if (!username) throw new ApiError(400, 'Username of the comment owner is required')
      return { ...base, link, quantity, username }
    }

    case ServiceType.Poll: {
      if (!link) throw new ApiError(400, 'Link is required')
      if (!quantity) throw new ApiError(400, 'Quantity is required')
      const answerNumber = asNumber(p.answerNumber)
      if (!answerNumber) throw new ApiError(400, 'Answer number of the poll is required')
      return { ...base, link, quantity, answerNumber }
    }

    case ServiceType.CommentReplies: {
      const username = asString(p.username)
      if (!username) throw new ApiError(400, 'Username is required')
      if (!link) throw new ApiError(400, 'Link is required')
      const comments = asList(p.comments)
      if (!comments?.length) throw new ApiError(400, 'Comments list is required')
      return { ...base, link, username, comments }
    }

    case ServiceType.InvitesFromGroups: {
      if (!link) throw new ApiError(400, 'Link is required')
      if (!quantity) throw new ApiError(400, 'Quantity is required')
      const groups = asList(p.groups)
      if (!groups?.length) throw new ApiError(400, 'Groups list is required')
      return { ...base, link, quantity, groups }
    }

    case ServiceType.Subscriptions: {
      const username = asString(p.username)
      if (!username) throw new ApiError(400, 'Username is required')
      const min = asNumber(p.min)
      const max = asNumber(p.max)
      if (!min || !max) throw new ApiError(400, 'min and max are required')
      const delay = asNumber(p.delay)
      if (delay === undefined) throw new ApiError(400, 'Delay is required')
      return {
        ...base,
        username,
        min,
        max,
        posts: asNumber(p.posts),
        oldPosts: asNumber(p.oldPosts),
        delay,
        expiry: asString(p.expiry),
      }
    }

    case ServiceType.WebTraffic: {
      if (!link) throw new ApiError(400, 'Link is required')
      if (!quantity) throw new ApiError(400, 'Quantity is required')
      const country = asString(p.country)
      if (!country) throw new ApiError(400, 'Country is required')
      const device = asNumber(p.device)
      if (!device) throw new ApiError(400, 'Device is required (1-5)')
      const typeOfTraffic = asNumber(p.typeOfTraffic)
      if (!typeOfTraffic) throw new ApiError(400, 'Type of traffic is required (1-3)')

      const out: CreateOrderInput = {
        ...base,
        link,
        quantity,
        runs: asNumber(p.runs),
        interval: asNumber(p.interval),
        country,
        device,
        typeOfTraffic,
      }
      if (typeOfTraffic === 1) {
        const googleKeyword = asString(p.googleKeyword)
        if (!googleKeyword) throw new ApiError(400, 'Google keyword is required for this traffic type')
        out.googleKeyword = googleKeyword
      } else if (typeOfTraffic === 2) {
        const referringUrl = asString(p.referringUrl)
        if (!referringUrl) throw new ApiError(400, 'Referring URL is required for this traffic type')
        out.referringUrl = referringUrl
      }
      return out
    }

    default:
      if (!link) throw new ApiError(400, 'Link is required')
      return { ...base, link, quantity }
  }
}

/**
 * Order orchestration: validates drafts, prices them, settles payment
 * (wallet or KHQR payment record) and places the order at the provider.
 */
export class OrderService {

  /** Creates an order funded by the user's wallet balance. */
  async createOrderFromWallet(userId: string, draft: OrderDraft) {
    const { service, quantity, totalPrice, providerInput, link } = await this.validateAndPrice(draft)
    await walletService.debit(userId, totalPrice, `Order: ${service.name}`, 'order')
    return this.placeOrder(userId, service, draft, quantity, totalPrice, providerInput, link, null)
  }

  /**
   * Creates a local order awaiting payment (status 'Pending Payment'). The
   * SMM provider order is only placed once the payment is settled.
   */
  async createPendingOrder(
    userId: string,
    draft: OrderDraft,
  ): Promise<{ order: OrderDoc; totalPrice: number }> {
    const { service, quantity, totalPrice, link } = await this.validateAndPrice(draft)
    const order = await orderRepository.create({
      orderNumber: await orderRepository.nextOrderNumber(),
      providerOrderId: null,
      user: userId as unknown as Types.ObjectId,
      service: service._id,
      type: service.type,
      link: link ?? '',
      quantity,
      pricePerUnit: service.pricePerUnit,
      totalPrice,
      currency: 'USD',
      params: draft.params ?? {},
      status: 'Pending Payment',
      payment: null,
    })
    return { order, totalPrice }
  }

  /**
   * Places the SMM provider order once payment is settled. Idempotent and
   * race-safe: the order is CLAIMED atomically (via findOneAndUpdate) before
   * calling the provider, so concurrent webhook + polling calls can never
   * place two SMM orders for one payment. Retries are allowed only when the
   * previous placement failed (order 'Paid' with a non-empty error).
   */
  async fulfillPendingOrder(
    orderId: Types.ObjectId | string,
    paymentId?: Types.ObjectId | string,
  ): Promise<OrderDoc> {
    const order = await orderRepository.findById(orderId.toString())
    if (!order) throw new ApiError(404, 'Order not found')
    if (order.providerOrderId) return order // already placed
    if (!['Pending Payment', 'Paid'].includes(order.status)) return order

    const service = await serviceRepository.findById(order.service.toString())
    if (!service || !service.isActive) throw new ApiError(400, 'Service is not available right now')
    if (!service.providerServiceId && !isManualService(service)) {
      throw new ApiError(400, 'Service cannot be ordered online')
    }

    const draft: OrderDraft = {
      serviceId: order.service.toString(),
      link: order.link,
      quantity: order.quantity,
      params: (order.params ?? {}) as Record<string, unknown>,
    }
    const { providerInput } = await this.validateAndPrice(draft)

    // Atomic claim — only one caller (webhook or poll) proceeds to place.
    const claimed = await OrderModel.findOneAndUpdate(
      {
        _id: order._id,
        providerOrderId: null,
        $or: [{ status: 'Pending Payment' }, { status: 'Paid', error: { $ne: '' } }],
      },
      { $set: { status: 'Paid', error: '', fulfillmentStartedAt: new Date() } },
    ).exec()

    if (!claimed) {
      // Someone else is fulfilling (or it is done) — reload and report as-is.
      const fresh = await orderRepository.findById(orderId.toString())
      return fresh ?? order
    }

    try {
      // Manual services are fulfilled by the shop owner — mark Processing so
      // the admin sees it in the queue; no provider order id to track.
      if (isManualService(service)) {
        order.providerOrderId = null
        order.status = 'Processing'
        order.error = ''
        if (paymentId) order.payment = paymentId as Types.ObjectId
        await order.save()
        return order
      }
       const result = await getSmmProvider(service.provider).createOrder(providerInput)
      order.providerOrderId = result.order
      order.status = 'Processing'
      order.error = ''
      if (paymentId) order.payment = paymentId as Types.ObjectId
      await order.save()
    } catch (err) {
      // Payment settled but the provider could not place the order yet.
      // Keep the order 'Paid' (with the error set) so a later poll/webhook
      // retries placement via the atomic claim above.
      order.status = 'Paid'
      order.error = err instanceof Error ? err.message : 'Provider order placement failed'
      await order.save()
      throw err
    }
    return order
  }

  private async validateAndPrice(draft: OrderDraft) {
    const service = await serviceRepository.findById(draft.serviceId)
    if (!service) throw new ApiError(404, 'Service not found')
    if (!service.isActive) throw new ApiError(400, 'Service is not available right now')
    if (!service.providerServiceId && !isManualService(service)) {
      throw new ApiError(400, 'Service cannot be ordered online')
    }

    const providerInput = buildProviderInput(service, draft)
    // Subscriptions are priced by their minimum tier (params.min) — the modal
    // previews exactly this amount. All other quantity services pass `quantity`.
    const quantity = asNumber(draft.quantity) ?? (asNumber(draft.params?.min) ?? 0)

    if (quantity && (service.min > 0 || service.max > 0)) {
      if (service.min > 0 && quantity < service.min) {
        throw new ApiError(400, `Minimum quantity for this service is ${service.min}`)
      }
      if (service.max > 0 && quantity > service.max) {
        throw new ApiError(400, `Maximum quantity for this service is ${service.max}`)
      }
    }

    // pricePerUnit is the provider's RATE PER 1,000 units (e.g. $0.84 per
    // 1,000 viewers). 30,000 viewers at $0.84/1k = $25.20, not $25,200.
    // Package / flat-price types have no quantity — the rate IS the price.
    // Services sold only as exactly one unit (min=1 max=1, e.g. "Kick Live
    // Viewer [50+50 Chats] [1-Week]" bundles) are flat-priced too — the rate
    // is the price of that single unit, NOT a per-1,000 rate.
    const isSingleUnit = service.min === 1 && service.max === 1
    const totalPrice = isSingleUnit
      ? round2(service.pricePerUnit)
      : quantity > 0
        ? round2((quantity * service.pricePerUnit) / 1000)
        : round2(service.pricePerUnit)

    // KHQR providers charge a $0.01 minimum — per-1k rates make small
    // quantities round to $0.00. Enforce the same floor the UI shows, so
    // wallet orders can never debit $0 and payments are never created for
    // $0.00.
    if (totalPrice > 0 && totalPrice < 0.01) {
      throw new ApiError(
        400,
        'Order total is below the $0.01 USD minimum — increase the quantity',
      )
    }

    return { service, quantity, totalPrice, providerInput, link: asString(draft.link) }
  }

  private async placeOrder(
    userId: string,
    service: ServiceDoc,
    draft: OrderDraft,
    quantity: number,
    totalPrice: number,
    providerInput: CreateOrderInput,
    link: string | undefined,
    paymentId: Types.ObjectId | null,
  ) {
    // Manual services are fulfilled by the shop owner — no provider call.
    if (isManualService(service)) {
      return orderRepository.create({
        orderNumber: await orderRepository.nextOrderNumber(),
        providerOrderId: null,
        user: userId as unknown as Types.ObjectId,
        service: service._id,
        type: service.type,
        link: link ?? '',
        quantity,
        pricePerUnit: service.pricePerUnit,
        totalPrice,
        currency: 'USD',
        params: draft.params ?? {},
        status: 'Processing',
        payment: paymentId,
      })
    }

    const result = await getSmmProvider(service.provider).createOrder(providerInput)
    const order = await orderRepository.create({
      orderNumber: await orderRepository.nextOrderNumber(),
      providerOrderId: result.order,
      user: userId as unknown as Types.ObjectId,
      service: service._id,
      type: service.type,
      link: link ?? '',
      quantity,
      pricePerUnit: service.pricePerUnit,
      totalPrice,
      currency: 'USD',
      params: draft.params ?? {},
      status: 'Processing',
      payment: paymentId,
    })
    return order
  }

  async listOrders(userId: string, params: { page?: number; limit?: number; status?: string }) {
    return orderRepository.list({ userId, ...params })
  }

  async getOrderForUser(userId: string, id: string) {
    const order = await orderRepository.findByIdForUser(id, userId)
    if (!order) throw new ApiError(404, 'Order not found')
    return order
  }

  async cancelOrder(userId: string, id: string) {
    const order = await this.getOrderForUser(userId, id)
    // getOrderForUser POPULATES `service`, so it is a ServiceDoc here — never
    // call .toString() on it blindly (a populated doc stringifies to
    // "[object Object]" and breaks the ObjectId cast below).
    const rawService = order.service as unknown
    const service =
      rawService && typeof rawService === 'object' && '_id' in rawService
        ? (rawService as ServiceDoc)
        : await serviceRepository.findById(String(rawService))

    if (order.providerOrderId) {
      // Already placed with the provider — it must support cancellation.
      if (!service?.cancel) throw new ApiError(400, 'This service does not support cancellation')
      const results = await getSmmProvider(service?.provider ?? 'smmwiz').cancelOrders([order.providerOrderId])
      const result = results[0]
      if (result && typeof result.cancel === 'object' && 'error' in result.cancel) {
        throw new ApiError(400, (result.cancel as { error: string }).error)
      }
    } else {
      // Not yet placed with the provider (still 'Pending Payment', KHQR-paid
      // but unplaced, or in the manual fulfilment queue) — cancel locally.
      // Provider cancellation support is irrelevant here: nothing was sent.
      if (!['Pending Payment', 'Paid', 'Processing'].includes(order.status)) {
        throw new ApiError(400, 'This order can no longer be cancelled')
      }
    }

    const priorStatus = order.status
    order.status = 'Cancelled'
    await order.save()

    // Expire any still-pending payment so its QR can never be settled after
    // the order is cancelled, and no fresh QR can be generated for it.
    const pending = await paymentRepository.findPendingForOrder(order._id.toString())
    if (pending) {
      pending.status = 'expired'
      await pending.save()
      emitPaymentStatus({
        referenceId: pending.referenceId,
        status: 'expired',
        orderId: order._id.toString(),
      })
    }

    // Refund the wallet ONLY when this order was actually wallet-funded.
    // Any payment document (even a historical order fulfilled before
    // order.payment was backfilled) means the money came from KHQR, not the
    // wallet — those are refunded through their provider. Unpaid pending
    // orders never debited the wallet either.
    const hasPayment = await paymentRepository.findOne({ order: order._id })
    if (!hasPayment && !order.payment && !['Pending Payment', 'Paid'].includes(priorStatus)) {
      await walletService.credit(
        userId,
        order.totalPrice,
        `Refund for cancelled order #${order.orderNumber ?? ''}`,
        'refund',
      )
    }
    return order
  }

  async requestRefill(userId: string, id: string) {
    const order = await this.getOrderForUser(userId, id)
    if (!order.providerOrderId) throw new ApiError(400, 'Refill is not available for this order')
    const service = await serviceRepository.findById(order.service.toString())
    const provider = service?.provider ?? 'smmwiz'
    const { refill } = await getSmmProvider(provider).createRefill(order.providerOrderId)
    return { refill }
  }

  async getOrderForAdmin(id: string) {
    const order = await orderRepository.findById(id)
    if (!order) throw new ApiError(404, 'Order not found')
    return order.populate([
      { path: 'service' },
      { path: 'user', select: 'name email avatarUrl' },
    ])
  }

  /**
   * Support-agent "Order again": re-places an existing order for the SAME
   * customer, funded from their wallet — identical to the customer's own
   * wallet-order flow. Throws the wallet's insufficient-balance error when
   * the customer cannot cover the charge.
   */
  async placeOrderAgainForAdmin(id: string) {
    const order = await orderRepository.findById(id)
    if (!order) throw new ApiError(404, 'Order not found')

    const userId = order.user.toString()
    const draft: OrderDraft = {
      serviceId: order.service.toString(),
      link: order.link,
      quantity: order.quantity,
      params: (order.params ?? {}) as Record<string, unknown>,
    }
    const { service, quantity, totalPrice, providerInput, link } =
      await this.validateAndPrice(draft)
    await walletService.debit(userId, totalPrice, `Order: ${service.name}`, 'order')
    return this.placeOrder(userId, service, draft, quantity, totalPrice, providerInput, link, null)
  }
}

export const orderService = new OrderService()
