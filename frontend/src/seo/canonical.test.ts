import { describe, expect, it } from 'vitest'
import { buildCanonicalUrl, canonicalFromLocation, canonicalOrigin, isCanonicalOrigin } from './canonical'

describe('buildCanonicalUrl', () => {
  it('home is the bare origin', () => {
    expect(buildCanonicalUrl('/')).toBe('https://digitalsmm.shop')
    expect(buildCanonicalUrl('')).toBe('https://digitalsmm.shop')
  })

  it('normalizes a leading slash + duplicate slashes', () => {
    expect(buildCanonicalUrl('services/tiktok')).toBe('https://digitalsmm.shop/services/tiktok/')
    expect(buildCanonicalUrl('//services//tiktok')).toBe('https://digitalsmm.shop/services/tiktok/')
  })

  it('appends a trailing slash by default', () => {
    expect(buildCanonicalUrl('/services')).toBe('https://digitalsmm.shop/services/')
  })

  it('can drop the trailing slash', () => {
    expect(
      buildCanonicalUrl('/services', { preserveTrailingSlash: false }),
    ).toBe('https://digitalsmm.shop/services')
  })

  it('strips query strings by default (sort/filter params never canonicalize)', () => {
    expect(buildCanonicalUrl('/services?sort=price_asc&page=2')).toBe(
      'https://digitalsmm.shop/services/',
    )
  })

  it('keeps query strings when explicitly requested', () => {
    expect(
      buildCanonicalUrl('/service/abc?ref=x', { stripQuery: false }),
    ).toBe('https://digitalsmm.shop/service/abc/?ref=x')
  })

  it('uses a custom origin when provided', () => {
    expect(buildCanonicalUrl('/terms', { origin: 'https://www.digitalsmm.shop' })).toBe(
      'https://www.digitalsmm.shop/terms/',
    )
  })

  it('never produces a self-conflicting canonical (www vs apex both resolve)', () => {
    const apex = buildCanonicalUrl('/services/tiktok')
    const www = buildCanonicalUrl('/services/tiktok', { origin: 'https://www.digitalsmm.shop' })
    // Both point at their own origin but never include a trailing query or
    // duplicated slashes — the canonical link uses exactly one form.
    expect(apex).not.toContain('?')
    expect(www).not.toContain('?')
    expect(apex.endsWith('/')).toBe(true)
    expect(www.endsWith('/')).toBe(true)
  })
})

describe('canonicalFromLocation', () => {
  it('uses pathname + search from a location-like object', () => {
    expect(
      canonicalFromLocation({ pathname: '/dashboard/wallet', search: '?tab=transactions' }),
    ).toBe('https://digitalsmm.shop/dashboard/wallet/')
  })
})

describe('canonicalOrigin + isCanonicalOrigin', () => {
  it('exposes the single preferred origin', () => {
    expect(canonicalOrigin).toBe('https://digitalsmm.shop')
  })

  it('recognizes canonical-origin URLs', () => {
    expect(isCanonicalOrigin('https://digitalsmm.shop/services')).toBe(true)
    expect(isCanonicalOrigin('https://evil.example.com')).toBe(false)
  })
})
