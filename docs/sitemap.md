# Sitemap

The customer frontend ships `public/sitemap.xml`. It lists **only valid, public,
canonical URLs** — private areas (`/dashboard`, `/admin`, `/pay`, `/auth`,
`/sign-in`) are never included.

## What's in it

| Section              | URLs                                                              |
|----------------------|-------------------------------------------------------------------|
| Home                 | `https://digitalsmm.shop/`                                        |
| Public SEO index     | `/services/`                                                      |
| Platform pages       | `/services/tiktok/`, `/services/facebook/`, `/services/instagram/`, `/services/youtube/`, `/services/telegram/` |
| Dynamic service pages| `/service/<id>/` for every **active** service in the catalogue    |
| Legal                | `/terms`, `/privacy`, `/refund-policy`, `/cookies`                |

## How it's generated

The committed `public/sitemap.xml` covers the static pages. The dynamic service
pages come from **real catalogue data**, so the sitemap is regenerated at
build/deploy time:

```bash
# from the frontend workspace
npm run sitemap:generate

# against a specific API (e.g. a staging backend)
API_BASE_URL=https://staging-api.digitalsmm.shop npm run sitemap:generate
```

The script (`frontend/scripts/generate-sitemap.mjs`):

1. Fetches `GET /api/categories?curated=true` and `GET /api/services` (all pages).
2. Emits platform pages only for platforms that actually have categories.
3. Emits `/service/<id>/` only for **active** services (`isActive !== false`).
4. Writes `frontend/public/sitemap.xml` with canonical, trailing-slash URLs.

Wire it before your production build (Vercel build command, Docker, CI):

```bash
npm run sitemap:generate && npm run build
```

The frontend `package.json` also has `build:seo` which runs both steps.

## Rules enforced

- **No private routes** — `/dashboard`, `/admin`, `/pay/…`, `/payment-result`,
  `/sign-in`, `/auth/…`, `/403`, `/500` are excluded (also disallowed in
  `robots.txt`).
- **No duplicates** — each URL appears exactly once.
- **No placeholder URLs** — service pages only exist for services returned by
  the live API.
- **Canonical URLs** — the sitemap origin is `https://digitalsmm.shop` and every
  URL matches the page's `<link rel="canonical">`.

## Verifying

```bash
# The sitemap must parse and reference the production domain only:
grep -o "https://[^<]*" public/sitemap.xml | sort -u

# Check the production sitemap responds:
curl -s https://digitalsmm.shop/sitemap.xml | head -20

# Submit the URL in Google Search Console (see docs/manual-setup/05-search-console.md).
```
