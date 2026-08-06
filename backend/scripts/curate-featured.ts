/**
 * Curate the best-selling Cambodia services as Featured.
 *
 * The storefront's "Recommended" sort puts `isFeatured` services first and
 * ServiceCard shows a "Trending" badge on them. This script picks the most
 * popular, best-value *active* services per platform (Facebook, TikTok,
 * Telegram, YouTube, Instagram) and marks them featured so they rise to the
 * top of the Explore page and the dashboard "Featured services" row.
 *
 * Selection rules (per platform):
 *   - service is active and its category name mentions the platform
 *   - name matches one of the popular growth terms (followers, views, likes…)
 *   - refillable (a quality/trust signal for SMM buyers) is preferred
 *   - cheaper per-1k rates win among candidates
 *   - capped at N per platform so the curated set stays tight
 *
 * Idempotent and purely additive: re-running re-picks the same set and never
 * duplicates, and it never un-features services (so anything you featured
 * manually in the admin panel is always preserved). Each pick also gets a
 * `sortOrder` (1..cap per platform, cheapest first) so the curated ranking
 * actually shows up in the storefront's featured-first sort.
 *
 * Usage (from backend/):
 *   npm run curate:featured
 */
import 'dotenv/config'
import { connectDatabase, disconnectDatabase } from '../src/config/database.js'
import { ServiceModel } from '../src/models/service.model.js'
import { CategoryModel } from '../src/models/category.model.js'
import { logger } from '../src/utils/logger.js'

interface PlatformRule {
  keyword: string
  /** Name substrings that mark a service as a best-seller type. */
  terms: string[]
  /** Maximum featured services to keep per platform. */
  cap: number
}

const RULES: PlatformRule[] = [
  {
    keyword: 'facebook',
    terms: ['followers', 'page likes', 'post likes', 'post shares', 'video views', 'reactions'],
    cap: 6,
  },
  {
    keyword: 'tiktok',
    terms: ['followers', 'views', 'likes', 'shares'],
    cap: 6,
  },
  {
    keyword: 'telegram',
    terms: ['members', 'post views', 'reactions', 'subscribers'],
    cap: 6,
  },
  {
    keyword: 'youtube',
    terms: ['subscribers', 'views', 'watchtime', 'likes'],
    cap: 6,
  },
  {
    keyword: 'instagram',
    terms: ['followers', 'reels', 'views', 'likes'],
    cap: 6,
  },
]

async function main(): Promise<void> {
  await connectDatabase()

  let featured = 0

  for (const rule of RULES) {
    // All categories whose name mentions the platform (case-insensitive).
    const categoryIds = (
      await CategoryModel.find({ name: { $regex: rule.keyword, $options: 'i' } })
        .select('_id')
        .lean()
        .exec()
    ).map((c) => String(c._id))
    if (categoryIds.length === 0) {
      logger.info(`[curate-featured] ${rule.keyword}: no categories — skipped`)
      continue
    }

    // Candidate pool: active, priced, in-platform, name matches a best-seller term.
    const candidates = await ServiceModel.find({
      isActive: true,
      category: { $in: categoryIds },
      pricePerUnit: { $gt: 0 },
      $or: rule.terms.map((t) => ({ name: { $regex: t, $options: 'i' } })),
    })
      .select('name pricePerUnit refill isFeatured sortOrder')
      .lean()
      .exec()

    // Score: refillable first, then cheaper per-1k price.
    const scored = candidates
      .map((s) => ({
        id: String(s._id),
        name: s.name,
        pricePer1k: s.pricePerUnit ?? 0,
        refill: Boolean(s.refill),
      }))
      .sort((a, b) => Number(b.refill) - Number(a.refill) || a.pricePer1k - b.pricePer1k)

    const picks = scored.slice(0, rule.cap)
    if (picks.length === 0) {
      logger.info(`[curate-featured] ${rule.keyword}: no matching candidates`)
      continue
    }

    // Additive only: mark picks as featured (idempotent) and rank them via
    // sortOrder (1..cap, cheapest first). Never un-feature — admin manual
    // features are always preserved.
    for (const [index, pick] of picks.entries()) {
      await ServiceModel.updateOne(
        { _id: pick.id },
        { $set: { isFeatured: true, sortOrder: index + 1 } },
      ).exec()
    }

    featured += picks.length
    logger.info(
      `[curate-featured] ${rule.keyword}: featured ${picks.length} — ` +
        picks.map((p) => `"${p.name.slice(0, 40)}" ($${p.pricePer1k.toFixed(2)}/1k)`).join('; '),
    )
  }

  logger.info(`[curate-featured] Done — ${featured} services marked as featured.`)
  await disconnectDatabase()
}

main().catch((err) => {
  logger.error('[curate-featured] Failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
