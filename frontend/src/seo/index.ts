import { watch, type WatchSource } from 'vue'
import { applySeoMetadata } from './metadata'
import { buildCanonicalUrl } from './canonical'
import {
  breadcrumbSchema,
  organizationSchema,
  productSchema,
  websiteSchema,
  type ProductSchemaInput,
} from './schema'
import { SEO_ORIGIN, SITE_NAME } from './config'
import type { BreadcrumbItem, SeoMetadata } from './types'

export { buildCanonicalUrl, canonicalOrigin } from './canonical'
export { organizationSchema, websiteSchema, breadcrumbSchema, productSchema }
export type { ProductSchemaInput } from './schema'
export type { BreadcrumbItem, SeoMetadata } from './types'
export { SEO_ORIGIN, SITE_NAME }

/**
 * Route-aware SEO for a Vue component.
 *
 *   const seo = useSeo()
 *   seo.apply({ title: 'TikTok Followers', description: '…' })
 *
 * Pass a WatchSource (computed/ref) to re-apply metadata whenever it
 * changes (e.g. when a service loads asynchronously).
 */
export function useSeo() {
  function apply(meta: SeoMetadata): void {
    applySeoMetadata(meta)
  }

  /** Applies metadata reactively from a source. */
  function applyFrom(source: WatchSource<SeoMetadata | null | undefined>): void {
    watch(
      source,
      (meta) => {
        if (meta) apply(meta)
      },
      { immediate: true },
    )
  }

  return { apply, applyFrom }
}

/** Convenience builder for a canonical URL from a route path. */
export function canonicalUrl(path: string): string {
  return buildCanonicalUrl(path)
}

/** Convenience: breadcrumb JSON-LD for a trail. */
export function breadcrumbs(items: BreadcrumbItem[]): object {
  return breadcrumbSchema(items)
}

/** Convenience: full-page product schema for a real service. */
export function serviceProductSchema(input: ProductSchemaInput): object {
  return productSchema(input)
}

export { applySeoMetadata }
