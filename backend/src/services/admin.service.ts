import { getSmmProvider } from './smm/provider.factory.js'
import { userRepository } from '../repositories/user.repository.js'
import { orderRepository } from '../repositories/order.repository.js'
import {
  categoryRepository,
  serviceRepository,
} from '../repositories/catalog.repository.js'
import { paymentRepository } from '../repositories/finance.repository.js'
import { SettingModel } from '../models/setting.model.js'

/** Admin operations: dashboard stats, provider sync and platform settings. */
export class AdminService {
  async dashboardStats() {
    const [users, orders, services, categories, paymentRows, statusBreakdown, providerBalance] =
      await Promise.all([
        userRepository.stats(),
        orderRepository.stats(),
        serviceRepository.stats(),
        categoryRepository.count({}),
        paymentRepository.revenueStats(),
        orderRepository.countByStatus(),
        getSmmProvider().getBalance().catch(() => null),
      ])

    const paymentTotals = (paymentRows as Array<{ _id: string; total: number; count: number }>).reduce(
      (acc, row) => {
        acc[row._id] = { total: row.total, count: row.count }
        return acc
      },
      {} as Record<string, { total: number; count: number }>,
    )

    return {
      users,
      orders,
      services,
      categories,
      paymentTotals,
      statusBreakdown,
      providerBalance,
    }
  }

  /** Fetches the provider catalogue and upserts services + categories. */
  async syncProviderServices() {
    const provider = getSmmProvider()
    const providerServices = await provider.getServices()

    let created = 0
    let updated = 0
    const categoryIds = new Map<string, string>()

    for (const ps of providerServices) {
      let categoryId: string | null = null
      if (ps.category) {
        if (!categoryIds.has(ps.category)) {
          const category = await categoryRepository.findOrCreateByName(ps.category)
          categoryIds.set(ps.category, category._id.toString())
        }
        categoryId = categoryIds.get(ps.category) ?? null
      }

      const existing = await serviceRepository.findByProviderId(ps.providerServiceId)
      await serviceRepository.upsertFromProvider({
        providerServiceId: ps.providerServiceId,
        name: ps.name,
        type: ps.type,
        categoryId,
        pricePerUnit: ps.rate,
        min: ps.min,
        max: ps.max,
        refill: ps.refill,
        cancel: ps.cancel,
        provider: provider.name,
      })
      if (existing) updated += 1
      else created += 1
    }

    return { provider: provider.name, created, updated, total: providerServices.length }
  }

  // ------------------------------------------------------------------
  // Settings
  // ------------------------------------------------------------------

  getAllSettings() {
    return SettingModel.find().sort({ key: 1 }).exec()
  }

  getSetting(key: string) {
    return SettingModel.findOne({ key }).exec()
  }

  setSetting(key: string, value: unknown, description?: string) {
    return SettingModel.findOneAndUpdate(
      { key },
      { $set: { value, description: description ?? '' } },
      { new: true, upsert: true },
    ).exec()
  }
}

export const adminService = new AdminService()
