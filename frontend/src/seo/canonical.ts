import { SEO_ORIGIN } from './config'
import type { CanonicalOptions } from './types'

/**
 * Canonical URL construction.
 *
 * Every page's canonical points at ONE preferred URL on the production
 * domain: no query strings (sort/filter/search params never canonicalize),
 * no www/non-www ambiguity, and the trailing slash matches whatever the
 * route actually renders. This prevents self-conflicting canonicals and
 * duplicate-content signals.
 */

/** The single preferred origin (apex, https). Kept in one place. */
export const canonicalOrigin: string = SEO_ORIGIN.replace(/\/+$/, '')

/**
 * Builds the canonical URL for a path.
 *
 * @param path     App path, e.g. '/services/tiktok' or '/service/abc'.
 * @param options  Overrides (mostly for tests).
 */
export function buildCanonicalUrl(path: string, options: Partial<CanonicalOptions> = {}): string {
  const origin = (options.origin ?? canonicalOrigin).replace(/\/+$/, '')

  // Split path from query EARLY so the trailing slash lands before any
  // query string (https://host/path/?query, never /path?query/).
  const [rawPath, rawQuery] = (path || '/').split('?')
  const stripQuery = options.stripQuery ?? true
  const query = stripQuery ? '' : rawQuery ? `?${rawQuery}` : ''

  // Normalize: ensure a leading slash, collapse duplicate slashes.
  let cleanPath = '/' + rawPath.replace(/^\/+/, '').replace(/\/{2,}/g, '/')

  // Homepage is the bare origin (no trailing slash, no query).
  if (cleanPath === '/' || cleanPath === '') return origin

  const preserveTrailing = options.preserveTrailingSlash ?? true
  const hasTrailing = cleanPath.endsWith('/')
  if (!hasTrailing && preserveTrailing) cleanPath = `${cleanPath}/`
  if (hasTrailing && !preserveTrailing) cleanPath = cleanPath.replace(/\/+$/, '')

  return `${origin}${cleanPath}${query}`
}

/**
 * Normalizes a raw location (href/path) into a canonical URL, stripping
 * scheme/host differences and query params. Used by the canonical link
 * element and OG url tag.
 */
export function canonicalFromLocation(location: Pick<Location, 'pathname' | 'search'>): string {
  return buildCanonicalUrl(location.pathname + location.search)
}

/** True when a URL already points at the preferred canonical origin. */
export function isCanonicalOrigin(url: string): boolean {
  try {
    return new URL(url).origin === canonicalOrigin
  } catch {
    return false
  }
}
