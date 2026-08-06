/**
 * Seed a curated Telegram service catalog.
 *
 * The SMMWiz provider only stocks 2 Telegram services, which makes the
 * Telegram chip look empty. This script adds the most popular Telegram
 * services that Cambodian shops buy (members, views, reactions, invites,
 * comments…) as `provider: 'manual'` services — the shop owner fulfils them
 * by hand, the same way most local SMM sellers run Telegram.
 *
 * Manual services support local cancellation (the customer can cancel while
 * the order is in the fulfilment queue). Refill is intentionally disabled
 * because there is no provider to trigger a refill for manual orders.
 *
 * Idempotent: re-running it updates names/prices but never duplicates.
 *
 * Usage (from backend/):
 *   npm run seed:telegram
 */
import 'dotenv/config'
import { connectDatabase, disconnectDatabase } from '../src/config/database.js'
import { ServiceModel } from '../src/models/service.model.js'
import { CategoryModel } from '../src/models/category.model.js'
import { ServiceType } from '../src/types/index.js'
import { logger } from '../src/utils/logger.js'

interface SeedService {
  name: string
  type: ServiceType
  description: string
  pricePerUnit: number
  min: number
  max: number
  refill: boolean
  cancel: boolean
  deliveryTime: string
  isFeatured: boolean
  sortOrder: number
}

/** Curated Telegram catalogue for the Cambodia market. Prices are USD per 1,000 units. */
const TELEGRAM_SERVICES: SeedService[] = [
  {
    name: 'Telegram Channel Members',
    type: ServiceType.Default,
    description: 'High-quality Telegram channel members. Manual delivery by our team.',
    pricePerUnit: 2,
    min: 50,
    max: 50000,
    refill: false,
    cancel: true,
    deliveryTime: '0–24 hours',
    isFeatured: true,
    sortOrder: 1,
  },
  {
    name: 'Telegram Channel Members (Fast)',
    type: ServiceType.Default,
    description: 'Quick-start Telegram members delivered within a few hours.',
    pricePerUnit: 2.5,
    min: 50,
    max: 20000,
    refill: false,
    cancel: true,
    deliveryTime: '0–6 hours',
    isFeatured: false,
    sortOrder: 2,
  },
  {
    name: 'Telegram Group Members',
    type: ServiceType.Default,
    description: 'Real-looking members for Telegram groups and channels.',
    pricePerUnit: 1.8,
    min: 50,
    max: 30000,
    refill: false,
    cancel: true,
    deliveryTime: '0–24 hours',
    isFeatured: true,
    sortOrder: 3,
  },
  {
    name: 'Telegram Post Views',
    type: ServiceType.Default,
    description: 'Views for any Telegram post — boost engagement fast.',
    pricePerUnit: 0.5,
    min: 100,
    max: 100000,
    refill: false,
    cancel: false,
    deliveryTime: '0–12 hours',
    isFeatured: true,
    sortOrder: 4,
  },
  {
    name: 'Telegram Channel Views',
    type: ServiceType.Default,
    description: 'Views for your Telegram channel profile and content.',
    pricePerUnit: 0.4,
    min: 100,
    max: 200000,
    refill: false,
    cancel: false,
    deliveryTime: '0–12 hours',
    isFeatured: false,
    sortOrder: 5,
  },
  {
    name: 'Telegram Post Reactions',
    type: ServiceType.Default,
    description: 'Reactions (likes) on Telegram posts and polls.',
    pricePerUnit: 1.2,
    min: 50,
    max: 20000,
    refill: false,
    cancel: true,
    deliveryTime: '0–24 hours',
    isFeatured: true,
    sortOrder: 6,
  },
  {
    name: 'Telegram Post Reactions (Custom)',
    type: ServiceType.Default,
    description: 'Choose the emoji reaction — 🔥 ❤️ 👍 👏 etc.',
    pricePerUnit: 1.5,
    min: 50,
    max: 10000,
    refill: false,
    cancel: true,
    deliveryTime: '0–24 hours',
    isFeatured: false,
    sortOrder: 7,
  },
  {
    name: 'Telegram Custom Comments',
    type: ServiceType.CustomComments,
    description: 'Custom comments on your Telegram post — tell us what to write.',
    pricePerUnit: 8,
    min: 10,
    max: 1000,
    refill: false,
    cancel: true,
    deliveryTime: '0–24 hours',
    isFeatured: false,
    sortOrder: 8,
  },
  {
    name: 'Telegram Invites from Groups',
    type: ServiceType.InvitesFromGroups,
    description: 'Invite members from other Telegram groups to your channel.',
    pricePerUnit: 4,
    min: 10,
    max: 5000,
    refill: false,
    cancel: true,
    deliveryTime: '24–72 hours',
    isFeatured: false,
    sortOrder: 9,
  },
  {
    name: 'Telegram Subscribers',
    type: ServiceType.Default,
    description: 'Permanent subscribers for your Telegram channel.',
    pricePerUnit: 3.5,
    min: 20,
    max: 10000,
    refill: false,
    cancel: true,
    deliveryTime: '24–72 hours',
    isFeatured: false,
    sortOrder: 10,
  },
  {
    name: 'Telegram Poll Votes',
    type: ServiceType.Poll,
    description: 'Votes for Telegram polls — answer number required.',
    pricePerUnit: 1,
    min: 50,
    max: 20000,
    refill: false,
    cancel: true,
    deliveryTime: '0–24 hours',
    isFeatured: false,
    sortOrder: 11,
  },
  {
    name: 'Telegram Comment Likes',
    type: ServiceType.CommentLikes,
    description: 'Likes on comments in your Telegram channel or group.',
    pricePerUnit: 1,
    min: 50,
    max: 20000,
    refill: false,
    cancel: true,
    deliveryTime: '0–24 hours',
    isFeatured: false,
    sortOrder: 12,
  },
  {
    name: 'Telegram Viewers (High Retention)',
    type: ServiceType.Default,
    description: 'High-retention viewers that watch longer — great for video posts.',
    pricePerUnit: 1,
    min: 100,
    max: 50000,
    refill: false,
    cancel: true,
    deliveryTime: '0–24 hours',
    isFeatured: false,
    sortOrder: 13,
  },
  {
    name: 'Telegram Premium Members',
    type: ServiceType.Default,
    description: 'Telegram Premium subscribers for your channel.',
    pricePerUnit: 6,
    min: 10,
    max: 5000,
    refill: false,
    cancel: true,
    deliveryTime: '24–48 hours',
    isFeatured: false,
    sortOrder: 14,
  },
  {
    name: 'Telegram Post Shares',
    type: ServiceType.Default,
    description: 'Shares/forwards of your Telegram post to grow reach.',
    pricePerUnit: 1.5,
    min: 50,
    max: 10000,
    refill: false,
    cancel: true,
    deliveryTime: '0–24 hours',
    isFeatured: false,
    sortOrder: 15,
  },
]

async function getOrCreateTelegramCategory() {
  const existing = await CategoryModel.findOne({ name: { $regex: /^telegram$/i } })
  if (existing) {
    // Make sure it is active and marked as the Telegram platform so the chip works.
    if (!existing.isActive || existing.platform !== 'telegram') {
      existing.isActive = true
      existing.platform = 'telegram'
      existing.sortOrder = existing.sortOrder || 10
      await existing.save()
      logger.info('[seed-telegram] Updated Telegram category (active, platform=telegram)')
    }
    return existing
  }
  const created = await CategoryModel.create({
    name: 'Telegram',
    slug: 'telegram',
    platform: 'telegram',
    description: 'Telegram growth services',
    icon: 'Send',
    sortOrder: 10,
    isActive: true,
  })
  logger.info(`[seed-telegram] Created Telegram category (${created._id})`)
  return created
}

async function main(): Promise<void> {
  await connectDatabase()

  const category = await getOrCreateTelegramCategory()
  let created = 0
  let updated = 0

  for (const svc of TELEGRAM_SERVICES) {
    const existing = await ServiceModel.findOne({ provider: 'manual', name: svc.name })
    await ServiceModel.findOneAndUpdate(
      { provider: 'manual', name: svc.name },
      {
        $set: {
          type: svc.type,
          category: category._id,
          description: svc.description,
          pricePerUnit: svc.pricePerUnit,
          currency: 'USD',
          min: svc.min,
          max: svc.max,
          refill: svc.refill,
          cancel: svc.cancel,
          deliveryTime: svc.deliveryTime,
          provider: 'manual',
          isActive: true,
          isFeatured: svc.isFeatured,
          sortOrder: svc.sortOrder,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
    if (existing) updated += 1
    else created += 1
  }

  logger.info(
    `[seed-telegram] Done — ${TELEGRAM_SERVICES.length} Telegram services synced ` +
      `(created: ${created}, updated: ${updated}). All are manual-fulfilment and visible on the storefront.`,
  )
  await disconnectDatabase()
}

main().catch((err) => {
  logger.error('[seed-telegram] Failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
