import { DEFAULT_DESCRIPTION, DEFAULT_OG_IMAGE, DEFAULT_TWITTER_CARD, SITE_NAME } from './config'
import { canonicalOrigin } from './canonical'
import type { SeoMetadata } from './types'

/**
 * Applies SEO metadata to the document <head>.
 *
 * Centralized — components call `useSeo(meta)` instead of touching
 * <title>/meta tags themselves. Setting the same value twice is a no-op,
 * and every tag is idempotent, so route transitions never duplicate tags.
 */

const TAG_IDS = {
  description: 'seo-description',
  robots: 'seo-robots',
  canonical: 'seo-canonical',
  ogType: 'seo-og-type',
  ogTitle: 'seo-og-title',
  ogDescription: 'seo-og-description',
  ogImage: 'seo-og-image',
  ogUrl: 'seo-og-url',
  ogSiteName: 'seo-og-site-name',
  twitterCard: 'seo-twitter-card',
  twitterTitle: 'seo-twitter-title',
  twitterDescription: 'seo-twitter-description',
  twitterImage: 'seo-twitter-image',
} as const

function ensureMeta(id: string, propertyOrName: string, key: 'property' | 'name'): HTMLMetaElement {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[data-seo="${id}"]`)
  if (!el) {
    // Reuse a static tag already present in index.html (avoids duplicates).
    el = document.head.querySelector<HTMLMetaElement>(`meta[${key}="${propertyOrName}"]`)
  }
  if (!el) {
    el = document.createElement('meta')
    el.dataset.seo = id
    el.setAttribute(key, propertyOrName)
    document.head.appendChild(el)
  } else {
    el.dataset.seo = id
  }
  return el
}

function setMeta(id: string, propertyOrName: string, key: 'property' | 'name', value: string): void {
  const el = ensureMeta(id, propertyOrName, key)
  if (el.getAttribute('content') !== value) el.setAttribute('content', value)
}

function setLink(id: string, rel: string, href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>(`link[data-seo="${id}"]`)
  if (!el) {
    el = document.createElement('link')
    el.dataset.seo = id
    el.rel = rel
    document.head.appendChild(el)
  }
  if (el.getAttribute('href') !== href) el.setAttribute('href', href)
}

/** JSON-LD script tags are replaced wholesale per route (no stale schema). */
function applySchemas(schemas: object[]): void {
  document.head.querySelectorAll('script[data-seo-jsonld]').forEach((node) => node.remove())
  for (const schema of schemas) {
    const script = document.createElement('script')
    script.type = 'application/ld+json'
    script.dataset.seoJsonld = ''
    script.textContent = JSON.stringify(schema)
    document.head.appendChild(script)
  }
}

/** Applies metadata (title, meta tags, canonical, JSON-LD) to <head>. */
export function applySeoMetadata(meta: SeoMetadata): void {
  if (typeof document === 'undefined') return

  document.title = meta.title

  const description = meta.description || DEFAULT_DESCRIPTION
  setMeta(TAG_IDS.description, 'description', 'name', description)

  if (meta.robots) setMeta(TAG_IDS.robots, 'robots', 'name', meta.robots)
  else ensureMeta(TAG_IDS.robots, 'robots', 'name')

  const canonical = meta.canonical || canonicalOrigin
  setLink(TAG_IDS.canonical, 'canonical', canonical)

  // Open Graph
  setMeta(TAG_IDS.ogType, 'og:type', 'property', meta.ogType ?? 'website')
  setMeta(TAG_IDS.ogTitle, 'og:title', 'property', meta.ogTitle ?? meta.title)
  setMeta(TAG_IDS.ogDescription, 'og:description', 'property', meta.ogDescription ?? description)
  setMeta(TAG_IDS.ogImage, 'og:image', 'property', meta.ogImage ?? DEFAULT_OG_IMAGE)
  setMeta(TAG_IDS.ogUrl, 'og:url', 'property', meta.ogUrl ?? canonical)
  setMeta(TAG_IDS.ogSiteName, 'og:site_name', 'property', SITE_NAME)

  // Twitter / X
  setMeta(TAG_IDS.twitterCard, 'twitter:card', 'name', meta.twitterCard ?? DEFAULT_TWITTER_CARD)
  setMeta(TAG_IDS.twitterTitle, 'twitter:title', 'name', meta.twitterTitle ?? meta.title)
  setMeta(
    TAG_IDS.twitterDescription,
    'twitter:description',
    'name',
    meta.twitterDescription ?? description,
  )
  setMeta(TAG_IDS.twitterImage, 'twitter:image', 'name', meta.twitterImage ?? DEFAULT_OG_IMAGE)

  applySchemas(meta.schemas ?? [])
}
