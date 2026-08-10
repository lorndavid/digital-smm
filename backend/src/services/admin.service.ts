import { getSmmProvider } from './smm/provider.factory.js'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'
import { userRepository } from '../repositories/user.repository.js'
import { orderRepository } from '../repositories/order.repository.js'
import {
  categoryRepository,
  serviceRepository,
} from '../repositories/catalog.repository.js'
import { paymentRepository } from '../repositories/finance.repository.js'
import { Types } from 'mongoose'
import type { Platform } from '../types/index.js'
import { SettingModel } from '../models/setting.model.js'
import { CategoryModel } from '../models/category.model.js'
import { ServiceModel } from '../models/service.model.js'

/** Deterministic slug for a provider category name. */
function slugFor(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'category'
  )
}

/**
 * Infers the storefront platform for a provider category name so cards get
 * the right icon/branding. Only used to UPGRADE categories that are still
 * 'other' — admin-chosen platforms are never overwritten (see sync).
 */
function inferPlatformForCategory(name: string): Platform {
  const n = name.toLowerCase()
  const rules: Array<[Platform, string[]]> = [
    ['tiktok', ['tiktok', 'tik tok']],
    ['facebook', ['facebook', 'fb']],
    ['telegram', ['telegram', 'tg']],
    ['youtube', ['youtube', 'yt']],
    ['instagram', ['instagram', 'ig']],
  ]
  for (const [platform, keywords] of rules) {
    if (keywords.some((k) => n.includes(k))) return platform
  }
  return 'other'
}

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

  /**
   * Fetches the provider catalogue and upserts services + categories.
   * Existing services are updated in place; admin curation flags
   * (isActive, isFeatured, sortOrder) are preserved.
   *
   * Syncs the env-configured provider (SMM_PROVIDER — 'smmwiz' in
   * production, 'mock' in local/dev/browser-test so the storefront
   * has data without a real API key).
   */
  async syncProviderServices() {
    const providerKeys = [env.SMM_PROVIDER] as const
    let totalCreated = 0
    let totalUpdated = 0
    let totalServices = 0

    for (const key of providerKeys) {
      try {
        const provider = getSmmProvider(key)
        const providerServices = await provider.getServices()

        // 1. Collect the unique category names once.
        const names = new Set<string>()
        for (const ps of providerServices) if (ps.category) names.add(ps.category)

        // 2. Bulk-upsert categories by slug.
        if (names.size > 0) {
          await CategoryModel.bulkWrite(
            [...names].map((name) => ({
              updateOne: {
                filter: { slug: slugFor(name) },
                update: { $setOnInsert: { name, slug: slugFor(name), platform: 'other' } },
                upsert: true,
              },
            })),
            { ordered: false },
          )
        }

        // 2b. Upgrade the default platform from 'other' to the inferred one.
        if (names.size > 0) {
          const platformBySlug = new Map<string, Platform>()
          for (const name of names) {
            const slug = slugFor(name)
            if (!platformBySlug.has(slug)) {
              platformBySlug.set(slug, inferPlatformForCategory(name))
            }
          }
          await CategoryModel.bulkWrite(
            [...platformBySlug.entries()].map(([slug, platform]) => ({
              updateOne: {
                filter: { slug, platform: 'other' },
                update: { $set: { platform } },
              },
            })),
            { ordered: false },
          )
        }

        // 3. Read back slug → category id.
        const categoryDocs = names.size
          ? await CategoryModel.find({ slug: { $in: [...names].map(slugFor) } })
              .select('slug')
              .exec()
          : []
        const categoryIdBySlug = new Map(categoryDocs.map((c) => [c.slug, c._id.toString()]))

        // 4. Bulk-upsert services in chunks.
        let created = 0
        let updated = 0
        const chunkSize = 500
        for (let i = 0; i < providerServices.length; i += chunkSize) {
          const chunk = providerServices.slice(i, i + chunkSize)
          const result = await ServiceModel.bulkWrite(
            chunk.map((ps) => {
              const categorySlug = ps.category ? slugFor(ps.category) : undefined
              const categoryId = categorySlug ? categoryIdBySlug.get(categorySlug) : undefined
              return {
                updateOne: {
                  filter: { providerServiceId: ps.providerServiceId, provider: provider.name },
                  update: {
                    $set: {
                      name: ps.name,
                      type: ps.type,
                      category: categoryId ? new Types.ObjectId(categoryId) : null,
                      pricePerUnit: ps.rate,
                      min: ps.min,
                      max: ps.max,
                      refill: ps.refill,
                      cancel: ps.cancel,
                      provider: provider.name,
                    },
                  },
                  upsert: true,
                },
              }
            }),
            { ordered: false },
          )
          created += result.upsertedCount
          updated += result.matchedCount
        }

        totalCreated += created
        totalUpdated += updated
        totalServices += providerServices.length
      } catch (err) {
        // Continue syncing remaining providers even if one fails.
        logger.warn(`[admin.service] sync failed for provider ${key}:`, err)
      }
    }

    return {
      provider: 'all',
      created: totalCreated,
      updated: totalUpdated,
      total: totalServices,
    }
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
