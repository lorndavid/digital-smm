import { PaymentModel, type Payment, type PaymentDoc } from '../models/payment.model.js'
import { WalletModel, type Wallet, type WalletDoc } from '../models/wallet.model.js'
import { BaseRepository } from './base.repository.js'

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export class PaymentRepository extends BaseRepository<Payment> {
  constructor() {
    super(PaymentModel)
  }

  findByReferenceId(referenceId: string): Promise<PaymentDoc | null> {
    return this.findOne({ referenceId })
  }

  /** Alias kept for compatibility with older call sites. */
  findByReference(referenceId: string): Promise<PaymentDoc | null> {
    return this.findByReferenceId(referenceId)
  }

  findByProviderPaymentId(providerPaymentId: string): Promise<PaymentDoc | null> {
    return this.findOne({ providerPaymentId })
  }

  /** A payment for this order that is still awaiting settlement. */
  findPendingForOrder(orderId: string): Promise<PaymentDoc | null> {
    return this.findOne({ order: orderId, status: { $in: ['pending', 'scanned'] } })
  }

  listByUser(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit
    return Promise.all([
      PaymentModel.find({ user: userId })
        .populate({ path: 'order', populate: { path: 'service' } })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      PaymentModel.countDocuments({ user: userId }).exec(),
    ])
  }

  listAdmin(params: { status?: string; search?: string; page?: number; limit?: number }) {
    const filter: Record<string, unknown> = {}
    if (params.status) filter.status = params.status
    if (params.search) {
      filter.$or = [{ referenceId: { $regex: params.search, $options: 'i' } }]
    }
    const page = params.page ?? 1
    const limit = params.limit ?? 20
    const skip = (page - 1) * limit
    return Promise.all([
      PaymentModel.find(filter)
        .populate('user', 'name email')
        .populate({ path: 'order', select: 'orderNumber', populate: { path: 'service', select: 'name' } })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      PaymentModel.countDocuments(filter).exec(),
    ])
  }

  /** Flat list (up to 5k) for CSV export. */
  findForExport(status?: string, search?: string) {
    const filter: Record<string, unknown> = {}
    if (status) filter.status = status
    if (search) {
      filter.$or = [{ referenceId: { $regex: search, $options: 'i' } }]
    }
    return PaymentModel.find(filter)
      .populate('user', 'name email')
      .populate({ path: 'order', select: 'orderNumber' })
      .sort({ createdAt: -1 })
      .limit(5000)
      .lean()
      .exec()
  }

  /** Today's revenue and per-status counts for the admin payment page. */
  async paymentStats() {
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)

    const [today, counts] = await Promise.all([
      PaymentModel.aggregate([
        {
          $match: {
            status: 'paid',
            approvedAt: { $gte: startOfToday },
          },
        },
        { $group: { _id: null, revenue: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]).exec(),
      PaymentModel.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]).exec(),
    ])

    const countMap: Record<string, number> = {}
    for (const row of counts) {
      countMap[row._id as string] = row.count
    }

    return {
      todayRevenue: today[0]?.revenue ?? 0,
      todayCount: today[0]?.count ?? 0,
      counts: countMap,
    }
  }

  async revenueStats() {
    const rows = await PaymentModel.aggregate([
      { $match: { status: 'paid' } },
      { $group: { _id: '$purpose', total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]).exec()
    return rows
  }
}

// ---------------------------------------------------------------------------
// Wallets
// ---------------------------------------------------------------------------

export class WalletRepository extends BaseRepository<Wallet> {
  constructor() {
    super(WalletModel)
  }

  findByUser(userId: string): Promise<WalletDoc | null> {
    return this.findOne({ user: userId })
  }

  async ensureForUser(userId: string): Promise<WalletDoc> {
    const existing = await this.findByUser(userId)
    if (existing) return existing
    return WalletModel.create({ user: userId, balance: 0, currency: 'USD' })
  }

  /** Lists the last N wallet transactions for a user. */
  async listTransactions(userId: string, limit = 50) {
    const wallet = await this.ensureForUser(userId)
    const transactions = wallet.transactions
      .slice()
      .sort((a, b) => {
        const aTime = (a as unknown as { createdAt?: Date }).createdAt ?? new Date(0)
        const bTime = (b as unknown as { createdAt?: Date }).createdAt ?? new Date(0)
        return bTime.getTime() - aTime.getTime()
      })
      .slice(0, limit)
    return transactions
  }
}

export const paymentRepository = new PaymentRepository()
export const walletRepository = new WalletRepository()
