# DigitalSMM — Disaster Recovery

> Honest status: most of this is **MANUAL INFRASTRUCTURE REQUIRED** — the
> recovery *procedures* are code-ready, but backups must be configured by an
> operator. We do not pretend backups exist when they are not configured.

## Realistic targets (single VPS + Atlas)

| Metric | Target | Note |
|---|---|---|
| RTO (recover service) | ~30–60 min | Docker image + cloudflared reinstall; worst case VPS rebuild |
| RPO (data loss) | ≤ 24 h | Requires the MongoDB Atlas backup below — **not yet enabled** |

## Components

| Component | Where | Failure mode | Recovery |
|---|---|---|---|
| MongoDB | Atlas | full outage | Atlas is managed; enable **Atlas Cloud Backups** (free tier: 24 h snapshot) — **[MANUAL]** |
| Redis | not used in prod (single instance) | — | nothing to recover |
| Backend | VPS Docker | container crash / bad deploy | `docker compose -f docker-compose.prod.yml up -d` or auto-rollback (`docs/rollback.md`) |
| Frontend + Admin | Vercel | deploy regression | Vercel dashboard → Deployments → Rollback |
| DNS | Cloudflare | misconfig | Cloudflare dashboard, TTLs are 5 min (Auto) |
| Tunnel | cloudflared on VPS | tunnel down | `sudo systemctl status cloudflared`; restarts automatically (`restart: unless-stopped` + systemd) |

## Backend recovery, step by step

```bash
# 1. Diagnose
cd /opt/digital-smm
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=100 backend

# 2. Restart the container
docker compose -f docker-compose.prod.yml up -d --force-recreate

# 3. Verify locally, then through the tunnel
curl http://127.0.0.1:4000/api/health
curl https://api.digitalsmm.shop/api/health
```

## Full VPS loss (recreate)

1. Provision a new Ubuntu 22.04 VPS (same IP or update the Cloudflare
   tunnel / DNS).
2. Re-run `guide-deployment.md` Part 4: Docker, deploy key, clone
   (`git clone git@github.com:lorndavid/digital-smm.git /opt/digital-smm`),
   `cp backend/.env.production.example backend/.env` with your saved secrets,
   build, `up -d`.
3. Reinstall cloudflared with the tunnel token and re-add the public hostname
   `api.digitalsmm.shop → http://localhost:4000`.
4. Point DNS back if the IP changed.

**Keep a copy of `backend/.env` values** (secrets) somewhere safe — this is
the one file git cannot restore.

## Environment recovery

- Backend: `backend/.env` (VPS). Template: `backend/.env.production.example`.
- Frontend/Admin: Vercel env vars (`VITE_API_BASE_URL`). Templates in repo.
- CI: GitHub Actions secrets (list in `docs/ci-cd.md`).

## Database backup (recommended — MANUAL)

1. Atlas → your cluster → **Backup** → enable *Cloud Backups* (free tier).
2. Restore drill: Atlas → Restore → choose snapshot → new cluster → point a
   temporary backend at it and confirm health.
3. Optional: nightly `mongodump` to object storage via a cron job on the VPS.
