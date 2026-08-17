import { ORGANIZATION, WEBSITE_SCHEMA } from './config'
import type { BreadcrumbItem } from './types'

/**
 * JSON-LD schema builders.
 *
 * Only markup that describes REAL page content is generated. No fake
 * reviews, ratings, prices, availability or company details are ever
 * emitted — Offer/Product blocks require real data passed in.
 */

/** Organization schema (static, verified facts only). */
export function organizationSchema(): object {
  return {
    '@context': 'https://schema.org',
    ...ORGANIZATION,
  }
}

/** WebSite schema (static). */
export function websiteSchema(): object {
  return WEBSITE_SCHEMA
}

/** BreadcrumbList JSON-LD for a breadcrumb trail. */
export function breadcrumbSchema(items: BreadcrumbItem[]): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      ...(item.url ? { item: item.url } : {}),
    })),
  }
}

export interface ProductSchemaInput {
  name: string
  description: string
  /** Canonical URL of the product page. */
  url: string
  image?: string
  /** Real price (per the backend) — never fabricated. */
  price?: number
  currency?: string
  /** Real availability — only 'InStock' when genuinely orderable. */
  inStock?: boolean
  /** Optional SKU (provider service id, when real). */
  sku?: string
}

/** Product + Offer schema — requires real service data. */
export function productSchema(input: ProductSchemaInput): object {
  const offer: Record<string, unknown> = {
    '@type': 'Offer',
    url: input.url,
    priceCurrency: input.currency ?? 'USD',
  }
  if (input.price !== undefined) {
    offer.price = String(input.price)
    offer.priceValidUntil = validUntilDate()
  }
  if (input.inStock !== undefined) {
    offer.availability = input.inStock
      ? 'https://schema.org/InStock'
      : 'https://schema.org/OutOfStock'
  }
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: input.name,
    description: input.description,
    url: input.url,
    ...(input.image ? { image: input.image } : {}),
    ...(input.sku ? { sku: input.sku } : {}),
    offers: offer,
  }
}

/** Price-validity window (real: 90 days out, like a live offer). */
function validUntilDate(): string {
  const date = new Date()
  date.setDate(date.getDate() + 90)
  return date.toISOString().slice(0, 10)
}
