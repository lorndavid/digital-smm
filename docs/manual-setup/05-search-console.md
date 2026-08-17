# 05 — Google Search Console

> ⚠️ **Manual step.** These actions happen in Google Search Console — the AI
> agent cannot create the account or verify ownership for you. Nothing here has
> been configured.

## Goal

Verify ownership of `digitalsmm.shop` and submit the sitemap so Google indexes
the public pages.

## Prerequisites (already in the repo)

The site is ready for indexing:

- `robots.txt` — public routes allowed, private routes (`/dashboard`,
  `/admin`, `/pay/…`, `/sign-in`, `/auth/…`) disallowed. **robots.txt is not
  security** — private routes are protected by auth server-side.
- `sitemap.xml` — canonical, public URLs only (see docs/sitemap.md).
- Canonical URLs + Open Graph/Twitter + JSON-LD (see docs/seo.md).

## Steps

1. **Search Console** → https://search.google.com/search-console → **Add
   property** → enter `https://digitalsmm.shop/`.
2. **Verify ownership.** Easiest with Google Analytics: choose "Google Analytics"
   and confirm you're an admin of the GA4 property (created in 04). Alternatives:
   HTML tag (paste into `<head>`) or DNS TXT record.
3. Repeat for `https://www.digitalsmm.shop/` (both hosts should be verified so
   canonicalization is clean).

### Submit the sitemap

1. Left sidebar → **Sitemaps**.
2. Enter `sitemap.xml` → **Submit**.
3. Google fetches `https://digitalsmm.shop/sitemap.xml` and shows status
   "Success".

## Expected result

- Property verified ("Owner" shows your Google account).
- Sitemap submitted and fetching successfully.
- Google starts crawling public pages; private routes stay out.

## Verify

- Search Console → **Sitemaps** → status "Success", no errors.
- Search Console → **URL Inspection** → paste `https://digitalsmm.shop/` →
  "URL is on Google".
- After a few days: **Indexing → Pages** shows the public pages.

## Gotchas

- Re-submit the sitemap after major catalogue changes (the sitemap regenerates
  at build time — see docs/sitemap.md).
- Indexing takes days to weeks; Search Console shows the real status.
- Do not submit `/dashboard/*` or `/admin/*` URLs — they are not in the sitemap
  and are disallowed in robots.txt.
