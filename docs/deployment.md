# Deployment

End-to-end deployment guide for the DigitalSMM monorepo: Vercel for the two
frontends, a VPS (Docker) for the backend. Manual account steps live in
[docs/manual-setup/](./manual-setup/).

## Topology

```text
digitalsmm.shop (Vercel)            → customer SPA (frontend/)
admin.digitalsmm.shop (Vercel)      → admin panel (admin/)
api.digitalsmm.shop (VPS, Docker)   → Express backend (:4000) + Mongo + Redis
```

## 1. Prerequisites (manual, outside this repo)

1. Domain + DNS — `docs/manual-setup/01-domain-and-dns.md`
2. Cloudflare (proxy + SSL) — `docs/manual-setup/02-cloudflare.md`
3. Vercel projects — `docs/manual-setup/03-vercel.md`
4. Google Analytics — `docs/manual-setup/04-google-analytics.md`
5. Search Console — `docs/manual-setup/05-search-console.md`
6. Sentry — `docs/manual-setup/06-sentry.md`
7. Uptime monitoring — `docs/manual-setup/07-uptime-monitoring.md`

## 2. Backend on the VPS (Docker)

```bash
# clone + build
git clone <repo> && cd digital-smm
cp .env.docker.example .env        # fill in REAL values
# Set NODE_ENV=production, MONGODB_URI (Atlas), Google keys, JWT secrets,
# SMMWIZ_API_KEY, CUTLUY_API_KEY + CUTLUY_WEBHOOK_SECRET, SENTRY_DSN,
# CORS_ORIGINS with the real origins, SMM_PROVIDER=smmwiz, PAYMENT_PROVIDER=cutluy.

docker compose up --build -d
```

- Customer frontend: `http://<vps-ip>:5173` (or behind Nginx/Cloudflare).
- API health: `curl http://localhost:4000/api/health`.
- Seed the super admin if you didn't set `SUPER_ADMIN_EMAIL`/`SUPER_ADMIN_PASSWORD`:
  ```bash
  cd backend && SUPER_ADMIN_PASSWORD='...' npm run create:super-admin -- --email you@example.com
  ```

For multi-instance scaling:

```bash
docker compose -f docker-compose.yml -f docker-compose.scale.yml up -d --scale backend=2
```

Set `REDIS_URL` when running multiple replicas (distributed SSE + rate limits).

## 3. Frontends on Vercel

For each project (frontend, admin):

| Var                  | frontend                      | admin                   |
|----------------------|-------------------------------|-------------------------|
| `VITE_API_BASE_URL`  | `https://api.digitalsmm.shop` | `https://api.digitalsmm.shop` |
| `VITE_APP_ENV`       | `production`                  | `production`            |
| `VITE_GA_MEASUREMENT_ID` | `G-XXXXXXXXXX`            | —                       |
| `VITE_SENTRY_DSN`    | (frontend DSN)                | (admin DSN)             |

Build command (recommended — generates the live sitemap first):

```bash
npm run build:seo   # = sitemap:generate && build
```

The repo's `vercel.json` SPA fallback rewrites already exist in both workspaces.

## 4. Post-deploy checklist

- [ ] `https://digitalsmm.shop/api/health` (via proxy) → `status: ok`
- [ ] `/api/ready` → `200` with `mongodb: ok`
- [ ] Google sign-in works from the live domain (redirect URI added in Google Cloud).
- [ ] CutLuy webhook configured to `https://api.digitalsmm.shop/webhooks/cutluy`
      with the matching signing secret; test payment settles.
- [ ] `robots.txt` + `sitemap.xml` reachable; sitemap submitted in Search Console.
- [ ] Sentry receives a test error (frontend + backend).
- [ ] Uptime monitors configured against `/api/health` (see 07-uptime-monitoring.md).
- [ ] `CORS_ORIGINS` includes apex + `www` + admin origin.

## Rollback

- Frontend: Vercel redeploy of the previous commit.
- Backend: `docker compose up --build -d` with the previous image tag, or
  `git checkout <prev> && docker compose up --build -d`.
