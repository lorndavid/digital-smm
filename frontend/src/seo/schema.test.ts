import { describe, expect, it } from 'vitest'
import {
  breadcrumbSchema,
  organizationSchema,
  productSchema,
  websiteSchema,
} from './schema'

describe('organizationSchema', () => {
  it('only contains real, verifiable facts', () => {
    const schema = organizationSchema() as Record<string, unknown>
    expect(schema['@type']).toBe('Organization')
    expect(schema.name).toBe('DigitalSMM')
    expect(schema.url).toBe('https://digitalsmm.shop')
    // No invented telephone/address/foundingDate/sameAs.
    expect(schema.telephone).toBeUndefined()
    expect(schema.address).toBeUndefined()
    expect(schema.foundingDate).toBeUndefined()
    expect(schema.sameAs).toBeUndefined()
  })
})

describe('websiteSchema', () => {
  it('describes the real website', () => {
    const schema = websiteSchema() as Record<string, unknown>
    expect(schema['@context']).toBe('https://schema.org')
    expect(schema['@type']).toBe('WebSite')
    expect(schema.name).toBe('DigitalSMM')
    expect(schema.url).toBe('https://digitalsmm.shop')
  })
})

describe('breadcrumbSchema', () => {
  it('assigns sequential positions', () => {
    const schema = breadcrumbSchema([
      { name: 'Home', url: 'https://digitalsmm.shop/' },
      { name: 'Services', url: 'https://digitalsmm.shop/services/' },
      { name: 'TikTok' },
    ]) as { itemListElement: Array<{ position: number; name: string; item?: string }> }
    expect(schema.itemListElement).toHaveLength(3)
    expect(schema.itemListElement[0].position).toBe(1)
    expect(schema.itemListElement[1].position).toBe(2)
    expect(schema.itemListElement[2].position).toBe(3)
    // Last crumb (current page) has no URL.
    expect(schema.itemListElement[2].item).toBeUndefined()
  })
})

describe('productSchema', () => {
  it('emits Product + Offer only from real data', () => {
    const schema = productSchema({
      name: 'TikTok Followers',
      description: 'Real TikTok followers.',
      url: 'https://digitalsmm.shop/service/abc/',
      price: 0.84,
      currency: 'USD',
      inStock: true,
      sku: '12345',
    }) as {
      '@type': string
      offers: { '@type': string; price: string; priceCurrency: string; availability: string }
    }
    expect(schema['@type']).toBe('Product')
    expect(schema.offers['@type']).toBe('Offer')
    expect(schema.offers.price).toBe('0.84')
    expect(schema.offers.priceCurrency).toBe('USD')
    expect(schema.offers.availability).toBe('https://schema.org/InStock')
  })

  it('omits price/availability when not provided (never fabricates)', () => {
    const schema = productSchema({
      name: 'Unknown Service',
      description: 'No pricing available.',
      url: 'https://digitalsmm.shop/service/x/',
    }) as { offers: Record<string, unknown> }
    expect(schema.offers.price).toBeUndefined()
    expect(schema.offers.availability).toBeUndefined()
  })

  it('marks out-of-stock when not orderable', () => {
    const schema = productSchema({
      name: 'S',
      description: 'D',
      url: 'https://digitalsmm.shop/service/y/',
      inStock: false,
    }) as { offers: { availability: string } }
    expect(schema.offers.availability).toBe('https://schema.org/OutOfStock')
  })
})
