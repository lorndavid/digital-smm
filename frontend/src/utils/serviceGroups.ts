import type { Platform, Service } from '@/types/models'

/**
 * Service grouping for the Explore page.
 *
 * SMMWiz names services like "Facebook Page Likes", "TikTok Likes and Views",
 * "Telegram Invites from Groups". When a platform chip is active we fetch the
 * whole platform once and group the services by their *kind* (the name minus
 * the platform prefix): "FB Page Likes", "FB Post Likes", "TikTok Followers",
 * "TikTok Views", "Telegram Members" — a clean two-level catalogue like the
 * big SMM panels. Pure + deterministic so it can run on any snapshot of data.
 */

/** Short display prefix used in group labels per platform keyword. */
export const PLATFORM_PREFIX: Record<string, string> = {
  facebook: 'FB',
  tiktok: 'TikTok',
  telegram: 'Telegram',
  youtube: 'YouTube',
  instagram: 'Instagram',
}

/** Leading aliases stripped from a service name before grouping. */
const PLATFORM_ALIASES: Record<string, string[]> = {
  facebook: ['facebook', 'fb'],
  tiktok: ['tiktok', 'tik tok', 'tt'],
  telegram: ['telegram', 'tg'],
  youtube: ['youtube', 'yt'],
  instagram: ['instagram', 'ig'],
}

/** Leading filler/verbs/quality words that would fragment groups. */
const LEADING_NOISE = new Set([
  'buy', 'get', 'order', 'add', 'start', 'real', 'instant', 'fast', 'premium',
  'best', 'cheap', 'top', 'high', 'quality', 'guaranteed', 'original', 'new',
  'auto', 'max', 'boost', 'increase', 'promote', 'grow', '100', 'with', 'refill',
])

/** Trailing geo/quality qualifiers that would fragment groups. */
const TRAILING_QUALIFIERS = new Set([
  // countries / regions
  'usa', 'us', 'uk', 'india', 'indonesia', 'malaysia', 'thailand', 'vietnam',
  'china', 'japan', 'korea', 'south', 'brazil', 'mexico', 'france', 'germany',
  'italy', 'spain', 'portugal', 'turkey', 'russia', 'poland', 'philippines',
  'pakistan', 'bangladesh', 'sri', 'lanka', 'arab', 'saudi', 'emirates',
  'qatar', 'kuwait', 'oman', 'bahrain', 'israel', 'egypt', 'nigeria', 'ghana',
  'kenya', 'southafrica', 'morocco', 'algeria', 'canada', 'australia',
  'singapore', 'hong', 'kong', 'taiwan', 'europe', 'asia', 'global',
  'worldwide', 'world',
  // quality / delivery words
  'real', 'refill', 'fast', 'instant', 'cheap', 'premium', 'best', 'quality',
  'guaranteed', 'original', 'new', 'drop', 'nondrop', 'non', '100%', '%',
  'with', 'auto', 'high', 'max', 'low', 'price', 'services', 'service',
])

/** Small connector words kept lowercase in group labels. */
const CONNECTORS = new Set(['a', 'an', 'and', 'from', 'in', 'of', 'to', 'the', 'for', 'with', '&', '+'])

function titleCase(word: string): string {
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : word
}

/**
 * Derives the subcategory "kind" from a service name, e.g.
 *   ("Facebook Page Likes", 'facebook')      → "Page Likes"
 *   ("TikTok Likes and Views", 'tiktok')     → "Likes & Views"
 *   ("Telegram Invites from Groups", …)      → "Invites from Groups"
 *   ("Instagram Reels Likes", 'instagram')   → "Reels Likes"
 * Falls back to "Other" when nothing meaningful remains.
 */
export function deriveSubcategory(serviceName: string, platform: string): string {
  const aliases = PLATFORM_ALIASES[platform] ?? []

  // Normalise: drop parentheticals, separators and squashed whitespace.
  let rest = serviceName
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[|:;,.•\-–—[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // Strip leading platform aliases AND noise words, alternating until stable
  // — real names start with either ("Facebook Page Likes", "Buy TikTok
  // Followers", "Get Facebook Page Likes"), so both must be handled in any
  // order.
  let changed = true
  while (changed && rest) {
    changed = false
    for (const alias of aliases) {
      if (rest === alias || rest.startsWith(`${alias} `)) {
        rest = rest.slice(alias.length).trim()
        changed = true
      }
    }
    const firstWord = rest.split(' ')[0]
    if (firstWord && LEADING_NOISE.has(firstWord)) {
      rest = rest.slice(firstWord.length).trim()
      changed = true
    }
  }

  // Take the first up-to-3 meaningful words.
  const phrase = rest.split(' ').filter(Boolean).slice(0, 3)

  // Drop trailing qualifiers (geo / quality) that would fragment groups.
  while (phrase.length) {
    const last = phrase[phrase.length - 1]
    if (!last || !TRAILING_QUALIFIERS.has(last)) break
    phrase.pop()
  }

  if (phrase.length === 0) return 'Other'

  const label = phrase
    .map((w) => (CONNECTORS.has(w) ? w : titleCase(w)))
    .join(' ')
    .replace(/\s+and\s+/g, ' & ')
    .replace(/\s+\+\s+/g, ' & ')
    .trim()

  return label || 'Other'
}

export interface ServiceGroup {
  /** Stable key (the derived kind, lowercased). */
  key: string
  /** Display label with the platform prefix, e.g. "FB Page Likes". */
  label: string
  count: number
  /** Cheapest per-1,000-unit price in the group (for the "from $" hint). */
  minPricePerThousand: number
  services: Service[]
}

/**
 * Groups services of one platform into subcategory buckets, sorted by size
 * (most popular first). "Other" always sorts last. The display label keeps
 * the word casing from the derivation (e.g. "Invites from Groups").
 */
export function groupServices(services: Service[], platform: string): ServiceGroup[] {
  interface Entry {
    kind: string
    count: number
    minPricePerThousand: number
    services: Service[]
  }
  const map = new Map<string, Entry>()
  for (const service of services) {
    const kind = deriveSubcategory(service.name, platform)
    const key = kind.toLowerCase()
    let entry = map.get(key)
    if (!entry) {
      entry = { kind, count: 0, minPricePerThousand: Infinity, services: [] }
      map.set(key, entry)
    }
    entry.count += 1
    entry.minPricePerThousand = Math.min(entry.minPricePerThousand, service.pricePerUnit * 1000)
    entry.services.push(service)
  }

  const prefix = PLATFORM_PREFIX[platform] ?? ''
  const groups: ServiceGroup[] = [...map.values()].map((g) => ({
    key: g.kind === 'Other' ? 'other' : g.kind.toLowerCase(),
    label: g.kind === 'Other' ? 'Other' : `${prefix ? `${prefix} ` : ''}${g.kind}`,
    count: g.count,
    minPricePerThousand: Math.round(g.minPricePerThousand * 100) / 100,
    services: g.services,
  }))

  groups.sort((a, b) => {
    if (a.key === 'other' || b.key === 'other') {
      if (a.key === b.key) return 0
      return a.key === 'other' ? 1 : -1
    }
    return b.count - a.count || a.label.localeCompare(b.label)
  })
  return groups
}

/**
 * Infers a platform from a category name — used as a fallback for cards whose
 * category is still 'other' (synced categories carry platform 'other' until
 * the backend inference pass or an admin sets it).
 */
export function inferPlatformFromCategoryName(name: string | undefined | null): Platform {
  const n = (name ?? '').toLowerCase()
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
