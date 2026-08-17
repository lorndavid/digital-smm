/** SEO metadata contract — single source of truth for every page. */
export interface SeoMetadata {
  title: string
  description: string
  /** Canonical URL (absolute, production domain). */
  canonical?: string
  robots?: string
  ogTitle?: string
  ogDescription?: string
  ogImage?: string
  ogUrl?: string
  ogType?: string
  twitterCard?: string
  twitterTitle?: string
  twitterDescription?: string
  twitterImage?: string
  /** JSON-LD schemas to inject on this page. */
  schemas?: object[]
}

/** A breadcrumb entry (visible + JSON-LD). */
export interface BreadcrumbItem {
  name: string
  /** Absolute URL. Omit for the current (last) crumb. */
  url?: string
}

/** Supported JSON-LD schema builders. */
export type SchemaType = 'Organization' | 'WebSite' | 'BreadcrumbList' | 'Product' | 'Offer'

/** Canonical URL normalization options. */
export interface CanonicalOptions {
  /** Production origin, e.g. https://digitalsmm.shop (no trailing slash). */
  origin: string
  /** Strip query string (default true — sorting/filter params never canonicalize). */
  stripQuery?: boolean
  /** Keep a trailing slash when the path already has one (default true). */
  preserveTrailingSlash?: boolean
}
