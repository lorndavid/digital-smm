import type { FilterQuery, HydratedDocument } from 'mongoose'
import { OrderModel, type Order, type OrderDoc } from '../models/order.model.js'
import { SettingModel } from '../models/setting.model.js'
import { ServiceModel, type ServiceDoc } from '../models/service.model.js'
import { CategoryModel, type CategoryDoc } from '../models/category.model.js'
import { BaseRepository } from './base.repository.js'

export interface ListOrdersParams {
  userId?: string
  status?: string
  search?: string
  page?: number
  limit?: number
}

export class OrderRepository extends BaseRepository<Order> {
  constructor() {
    super(OrderModel)
  }

  findByProviderOrderId(providerOrderId: number): Promise<OrderDoc | null> {
    return this.findOne({ providerOrderId })
  }

  async list(params: ListOrdersParams) {
    const filter: FilterQuery<Order> = {}
    if (params.userId) filter.user = params.userId
    if (params.status) filter.status = params.status
    if (params.search) {
      const numeric = Number(params.search)
      if (!Number.isNaN(numeric)) {
        filter.$or = [{ orderNumber: numeric }, { providerOrderId: numeric }]
      }
    }

    const page = params.page ?? 1
    const limit = params.limit ?? 20
    const skip = (page - 1) * limit

    const [docs, total] = await Promise.all([
      OrderModel.find(filter)
        .populate<{ service: ServiceDoc & { category: CategoryDoc } }>('service')
        .populate('user', 'name email avatarUrl')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      OrderModel.countDocuments(filter).exec(),
    ])
    return { items: docs, total, page, limit }
  }

  async findByIdForUser(id: string, userId: string): Promise<OrderDoc | null> {
    return OrderModel.findOne({ _id: id, user: userId }).populate('service').exec()
  }

  /**
   * Atomically allocates the next human friendly order number using an
   * upserted counter document.
   */
  async nextOrderNumber(): Promise<number> {
    const doc = await SettingModel.findOneAndUpdate(
      { key: 'order_counter' },
      { $inc: { value: 1 } },
      { new: true, upsert: true },
    ).exec()
    return Number(doc?.value ?? 1)
  }

  /** Orders still being delivered that are eligible for provider sync. */
  async findSyncable(limit = 100) {
    return OrderModel.find({
      providerOrderId: { $ne: null },
      status: { $in: ['Processing', 'In progress', 'Partial'] },
    })
      .populate<{ service: ServiceDoc }>('service')
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec()
  }

  countByStatus(): Promise<Array<{ _id: string; count: number }>> {
    return OrderModel.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]).exec()
  }

  stats(): Promise<{ total: number; revenue: number }> {
    return Promise.all([
      OrderModel.countDocuments().exec(),
      OrderModel.aggregate([
        { $group: { _id: null, revenue: { $sum: '$totalPrice' } } },
      ]).exec(),
    ]).then(([total, rows]) => ({
      total,
      revenue: (rows[0]?._id === undefined ? 0 : (rows[0] as { revenue?: number }).revenue) ?? 0,
    }))
  }
}

export type { HydratedDocument }

export const orderRepository = new OrderRepository()
