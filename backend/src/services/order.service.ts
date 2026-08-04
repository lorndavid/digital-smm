import type { Types } from 'mongoose'
import { ServiceType } from '../types/index.js'
import type { CreateOrderInput } from '../interfaces/smm-provider.interface.js'
import { orderRepository } from '../repositories/order.repository.js'
import { serviceRepository, type ServiceDoc } from '../repositories/catalog.repository.js'
import { OrderModel, type OrderDoc } from '../models/order.model.js'
import { getSmmProvider } from './smm/provider.factory.js'
import { walletService } from './wallet.service.js'
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
  private readonly provider = getSmmProvider()

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
  async fulfillPendingOrder(orderId: Types.ObjectId | string): Promise<OrderDoc> {
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
        await order.save()
        return order
      }
      const result = await this.provider.createOrder(providerInput)
      order.providerOrderId = result.order
      order.status = 'Processing'
      order.error = ''
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
    const quantity = asNumber(draft.quantity) ?? 0

    if (quantity && (service.min > 0 || service.max > 0)) {
      if (service.min > 0 && quantity < service.min) {
        throw new ApiError(400, `Minimum quantity for this service is ${service.min}`)
      }
      if (service.max > 0 && quantity > service.max) {
        throw new ApiError(400, `Maximum quantity for this service is ${service.max}`)
      }
    }

    const totalPrice = round2(quantity * service.pricePerUnit)
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

    const result = await this.provider.createOrder(providerInput)
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
    const service = await serviceRepository.findById(order.service.toString())
    if (!service?.cancel) throw new ApiError(400, 'This service does not support cancellation')

    if (order.providerOrderId) {
      const results = await this.provider.cancelOrders([order.providerOrderId])
      const result = results[0]
      if (result && typeof result.cancel === 'object' && 'error' in result.cancel) {
        throw new ApiError(400, (result.cancel as { error: string }).error)
      }
    } else {
      // Manual order (no provider to cancel) — cancel locally. Only allowed
      // while it is still in the admin fulfilment queue.
      if (!['Processing', 'Paid', 'Pending Payment'].includes(order.status)) {
        throw new ApiError(400, 'This order can no longer be cancelled')
      }
    }

    order.status = 'Cancelled'
    await order.save()

    // Refund the wallet when the order was wallet-funded.
    if (!order.payment) {
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
    const { refill } = await this.provider.createRefill(order.providerOrderId)
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
}

export const orderService = new OrderService()
