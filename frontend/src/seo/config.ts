/**
 * Site-wide SEO configuration.
 *
 * The canonical origin is the single production domain used for canonical
 * URLs, sitemap entries, Open Graph and schema.org markup. All values here
 * are public.
 */

/** Production canonical origin — no trailing slash, no path. */
export const SEO_ORIGIN = 'https://digitalsmm.shop'

/** Default site name for OG / schema markup. */
export const SITE_NAME = 'DigitalSMM'

/** Default description when a page doesn't supply its own. */
export const DEFAULT_DESCRIPTION =
  'Buy real TikTok, Facebook, Instagram, YouTube and Telegram growth with instant delivery, real-time tracking and secure KHQR payments.'

/** Default social share image (must exist in public/). */
export const DEFAULT_OG_IMAGE = `${SEO_ORIGIN}/og-image.svg`

/** Twitter card style used site-wide. */
export const DEFAULT_TWITTER_CARD = 'summary_large_image'

/** Organization facts — only real, verifiable business information. */
export const ORGANIZATION = {
  '@type': 'Organization',
  name: SITE_NAME,
  url: SEO_ORIGIN,
  logo: `${SEO_ORIGIN}/favicon.svg`,
  // No telephone/address/foundingDate/sameAs — those details are not
  // verifiable from the project and must never be invented.
} as const

/** WebSite schema — SearchAction is omitted (no site search URL exists). */
export const WEBSITE_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: SITE_NAME,
  url: SEO_ORIGIN,
  description: DEFAULT_DESCRIPTION,
} as const
