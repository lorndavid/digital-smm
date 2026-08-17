# 03 — Vercel

> ⚠️ **Manual step.** These actions happen in the Vercel dashboard — the AI
> agent cannot perform them for you. Nothing here has been configured.

## Goal

Deploy the customer frontend (`frontend/`) and admin panel (`admin/`) to Vercel
with the production environment variables set.

## Steps

### Create the projects

1. **Vercel dashboard** → **Add New → Project** → import your Git repository.
2. Create **two** projects from the same repo:

   | Project | Root directory | Framework preset |
   |---------|----------------|------------------|
   | `digitalsmm-frontend` | `frontend/` | Vite |
   | `digitalsmm-admin` | `admin/` | Vite |

   > Vercel detects the workspace root automatically from the `package.json`.
   > If prompted, set "Root Directory" to `frontend/` (or `admin/`).

### Environment variables

**Customer frontend project:**

| Name                     | Value                        | Notes                          |
|--------------------------|------------------------------|--------------------------------|
| `VITE_API_BASE_URL`      | `https://api.digitalsmm.shop`| (your backend origin)          |
| `VITE_APP_ENV`           | `production`                 |                                |
| `VITE_GA_MEASUREMENT_ID` | `G-XXXXXXXXXX`               | from 04-google-analytics.md    |
| `VITE_SENTRY_DSN`        | `https://...@sentry.io/...`  | from 06-sentry.md              |

**Admin project:**

| Name                | Value                        |
|---------------------|------------------------------|
| `VITE_API_BASE_URL` | `https://api.digitalsmm.shop`|
| `VITE_APP_ENV`      | `production`                 |
| `VITE_SENTRY_DSN`   | (admin DSN from 06-sentry.md)|

### Domains

1. Project → **Settings → Domains** → add `digitalsmm.shop` and
   `www.digitalsmm.shop` (customer project).
2. Admin project → add `admin.digitalsmm.shop`.
3. Follow Vercel's instructions to point the DNS at Vercel if you are **not**
   using Cloudflare (see 01-domain-and-dns.md if you are).

### Build settings (recommended)

| Setting         | Value                          |
|-----------------|--------------------------------|
| Build command   | `npm run build:seo`            |
| Output dir      | `dist`                         |

`build:seo` runs the sitemap generator (queries the live API) before `vite
build`, so the deployed `sitemap.xml` contains the real service URLs.

## Expected result

- `https://digitalsmm.shop` serves the customer app.
- `https://admin.digitalsmm.shop` serves the admin panel.
- Both talk to `https://api.digitalsmm.shop` (backend must be live — see
  docs/deployment.md).

## Verify

- Open the live URLs; sign in works; catalogue loads.
- `curl -s https://digitalsmm.shop/sitemap.xml | head` shows real service URLs.
- Deployments: every push to `main` triggers a new deploy (default branch).

## Gotchas

- `vercel.json` SPA rewrites already exist in both workspaces — do not remove
  them (lazy chunks + deep links need the fallback).
- Vercel env vars are **public** (`VITE_*` inlined into the bundle) — never put
  secrets here.
