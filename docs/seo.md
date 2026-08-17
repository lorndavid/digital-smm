# SEO

The customer frontend ships a centralized SEO layer: metadata, canonical URLs,
Open Graph / Twitter cards and JSON-LD schema, all driven from one module.

## Architecture

```text
Vue page (route params / fetched data)
      ↓
useSeo() composable (frontend/src/seo/)
      ↓
<head>: title · meta · canonical · JSON-LD
```

Pages call `useSeo()` and pass a metadata object (or a reactive source). They
never touch `<title>`/meta tags directly.

## Modules

| File                     | Purpose                                                        |
|--------------------------|----------------------------------------------------------------|
| `src/seo/config.ts`      | Canonical origin, site name, default OG image, Organization.   |
| `src/seo/canonical.ts`   | Canonical URL builder (query stripping, slash normalization).  |
| `src/seo/metadata.ts`    | Applies title/meta/canonical/JSON-LD to `<head>` idempotently. |
| `src/seo/schema.ts`      | JSON-LD builders: Organization, WebSite, BreadcrumbList, Product. |
| `src/seo/types.ts`       | `SeoMetadata` contract.                                        |
| `src/seo/index.ts`       | Public API: `useSeo()`, `canonicalUrl()`, schema helpers.      |

## Canonical URLs

Every page's canonical points at **one preferred URL** on the production
domain (`https://digitalsmm.shop`):

- Query strings are stripped (`?sort=…&page=2` never canonicalize).
- `www` vs apex — the site prefers the apex; any request to `www` still gets a
  canonical pointing at the apex origin.
- Trailing slashes are preserved to match the rendered route.
- No self-conflicting canonicals: a page emits exactly one canonical link.

## Open Graph / Twitter

Every page gets `og:title`, `og:description`, `og:url`, `og:image`, `og:type`,
`og:site_name`, `twitter:card`, `twitter:title`, `twitter:description`,
`twitter:image`. The default social image is `public/og-image.svg`
(`https://digitalsmm.shop/og-image.svg`) — a real file, so no broken share
preview. Pages may override with real images only.

## Schema.org

Only real content is marked up:

- **Organization** — name, url, logo. No invented telephone/address/founding
  date/social accounts.
- **WebSite** — name, url, description.
- **BreadcrumbList** — generated from the visible breadcrumb trail.
- **Product + Offer** — emitted only on real service pages, with real price,
  currency and availability. No fake reviews/ratings.

## Public SEO pages

| Route                 | Page                                                            |
|-----------------------|-----------------------------------------------------------------|
| `/services`           | Public index of the five platforms (real catalogue links).      |
| `/services/:platform` | Platform landing page (real services of that platform).         |
| `/service/:id`        | Single service page (real data, Product schema, related links). |

These pages are **public** (no auth) and render **real catalogue data** only —
inactive/removed services 404. They feed the sitemap (see [sitemap.md](./sitemap.md))
and the internal-linking graph.

## Files & content

- `robots.txt` — disallows private routes (`/dashboard`, `/admin`, `/pay/…`,
  `/sign-in`, `/auth/…`); never treats robots.txt as security.
- `sitemap.xml` — generated from live catalogue data (see sitemap.md).
- Reusable SEO components under `src/components/seo/`: SeoHero, SeoBreadcrumbs,
  ServiceOverview, ServiceBenefits, ServiceInformation, ServicePricing,
  ServiceFAQ, RelatedServices, ServiceCTA.
