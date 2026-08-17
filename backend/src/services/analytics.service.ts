import { OrderModel } from '../models/order.model.js'
import { PaymentModel } from '../models/payment.model.js'
import { UserModel } from '../models/user.model.js'
import { ServiceModel } from '../models/service.model.js'
import { CategoryModel } from '../models/category.model.js'

/**
 * Admin analytics — the DATABASE is the business source of truth. Revenue,
 * orders, users, conversions and service rankings are computed from
 * MongoDB aggregates (never from GA4 or other third-party data).
 */

/** Supported ranges — aligned with the admin Analytics UI. */
export type AnalyticsRange =
  | 'today'
  | '7d'
  | '30d'
  | '90d'
  | 'this_month'
  | 'last_month'
  | 'custom'

function rangeStart(range: AnalyticsRange, customStart?: string, customEnd?: string): Date {
  const now = new Date()
  switch (range) {
    case 'today': {
      const d = new Date(now)
      d.setHours(0, 0, 0, 0)
      return d
    }
    case '7d':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    case '30d':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    case '90d':
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
    case 'this_month': {
      const d = new Date(now)
      d.setDate(1)
      d.setHours(0, 0, 0, 0)
      return d
    }
    case 'last_month': {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      return d
    }
    case 'custom':
      return customStart ? new Date(customStart) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    default:
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  }
}

function rangeEnd(range: AnalyticsRange, customEnd?: string): Date {
  if (range === 'custom') return customEnd ? new Date(customEnd) : new Date()
  if (range === 'last_month') {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  }
  return new Date()
}

export class AnalyticsService {
  /** Revenue + payment KPIs for a range (real DB data). */
  async revenue(range: AnalyticsRange, customStart?: string, customEnd?: string) {
    const start = rangeStart(range, customStart, customEnd)
    const end = rangeEnd(range, customEnd)

    const paidMatch = {
      status: 'paid',
      approvedAt: { $gte: start, $lt: end },
    }

    const [paid, failed, refunded, counts] = await Promise.all([
      PaymentModel.aggregate([
        { $match: paidMatch },
        { $group: { _id: null, revenue: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]).exec(),
      PaymentModel.countDocuments({ status: 'failed', createdAt: { $gte: start, $lt: end } }).exec(),
      PaymentModel.countDocuments({ status: 'refunded', approvedAt: { $gte: start, $lt: end } }).exec(),
      PaymentModel.aggregate([{ $group: { _id: '$purpose', total: { $sum: '$amount' }, count: { $sum: 1 } } }])
        .exec(),
    ])

    const purpose = (counts as Array<{ _id: string; total: number; count: number }>).reduce(
      (acc, row) => {
        acc[row._id] = { total: row.total, count: row.count }
        return acc
      },
      {} as Record<string, { total: number; count: number }>,
    )

    const revenue = paid[0]?.revenue ?? 0
    const successfulPayments = paid[0]?.count ?? 0

    // Average order value — paid ORDER payments only.
    const orderPaid = purpose.order
    const averageOrderValue = orderPaid && orderPaid.count > 0 ? orderPaid.total / orderPaid.count : 0

    return {
      range,
      start: start.toISOString(),
      end: end.toISOString(),
      totalRevenue: Math.round(revenue * 100) / 100,
      successfulPayments,
      failedPayments: failed,
      refunds: refunded,
      averageOrderValue: Math.round(averageOrderValue * 100) / 100,
      byPurpose: purpose,
    }
  }

  /** Orders, users + conversion KPIs for a range. */
  async overview(range: AnalyticsRange, customStart?: string, customEnd?: string) {
    const start = rangeStart(range, customStart, customEnd)
    const end = rangeEnd(range, customEnd)

    const [orders, users, paidOrders, ordersByStatus] = await Promise.all([
      OrderModel.countDocuments({ createdAt: { $gte: start, $lt: end } }).exec(),
      UserModel.countDocuments({ createdAt: { $gte: start, $lt: end } }).exec(),
      OrderModel.countDocuments({
        createdAt: { $gte: start, $lt: end },
        status: { $nin: ['Pending Payment', 'Cancelled', 'Failed', 'Refunded'] },
      }).exec(),
      OrderModel.aggregate([
        { $match: { createdAt: { $gte: start, $lt: end } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]).exec(),
    ])

    return {
      range,
      start: start.toISOString(),
      end: end.toISOString(),
      orders,
      users,
      paidOrders,
      // Conversion: orders that reached a paid/processing state vs total.
      conversionRate: orders > 0 ? Math.round((paidOrders / orders) * 10000) / 100 : 0,
      ordersByStatus: ordersByStatus as Array<{ _id: string; count: number }>,
    }
  }

  /** Service / platform analytics (top services, platform breakdowns). */
  async services(range: AnalyticsRange, customStart?: string, customEnd?: string) {
    const start = rangeStart(range, customStart, customEnd)
    const end = rangeEnd(range, customEnd)

    // Top services by order count + revenue (paid, non-cancelled orders).
    const [topServices, platformRows] = await Promise.all([
      OrderModel.aggregate([
        {
          $match: {
            createdAt: { $gte: start, $lt: end },
            status: { $nin: ['Pending Payment', 'Cancelled', 'Failed', 'Refunded'] },
          },
        },
        { $group: { _id: '$service', count: { $sum: 1 }, revenue: { $sum: '$totalPrice' } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: 'services',
            localField: '_id',
            foreignField: '_id',
            as: 'service',
          },
        },
        { $unwind: { path: '$service', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            serviceName: { $ifNull: ['$service.name', 'Removed service'] },
            count: 1,
            revenue: 1,
          },
        },
      ]).exec(),

      // Orders grouped by their service's category platform.
      OrderModel.aggregate([
        {
          $match: {
            createdAt: { $gte: start, $lt: end },
            status: { $nin: ['Pending Payment', 'Cancelled', 'Failed', 'Refunded'] },
          },
        },
        {
          $lookup: {
            from: 'services',
            localField: 'service',
            foreignField: '_id',
            as: 'service',
          },
        },
        { $unwind: { path: '$service', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'categories',
            localField: 'service.category',
            foreignField: '_id',
            as: 'category',
          },
        },
        { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: { $ifNull: ['$category.platform', 'other'] },
            orders: { $sum: 1 },
            revenue: { $sum: '$totalPrice' },
          },
        },
        { $sort: { revenue: -1 } },
      ]).exec(),
    ])

    return {
      range,
      start: start.toISOString(),
      end: end.toISOString(),
      topServices: topServices as Array<{
        serviceName: string
        count: number
        revenue: number
      }>,
      byPlatform: platformRows as Array<{ _id: string; orders: number; revenue: number }>,
      totalServices: await ServiceModel.countDocuments({ isActive: true }).exec(),
      totalCategories: await CategoryModel.countDocuments({ isActive: true }).exec(),
    }
  }
}

export const analyticsService = new AnalyticsService()
