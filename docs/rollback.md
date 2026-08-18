# DigitalSMM — Deployment Rollback

## Policy (deterministic, no "AI decides")

Automatic rollback happens **only** for deployment-level failures:

- container cannot start / crash-loops
- `/api/ready` fails after the retry budget (15 × 5s)
- critical smoke test fails after deploy

It does **NOT** happen for: one 404, one user validation error, one provider
timeout, one slow request. Those are monitored and alerted, not rolled back.

## How it works (backend)

`scripts/backend-deploy.sh <sha>` (run by `backend-deploy.yml` or manually):

1. `IMAGE_TAG=<sha> docker compose -f docker-compose.prod.yml build backend`
2. `up -d --force-recreate` → container from the immutable image
   `digitalsmm-prod-backend:<sha>`
3. Probe `http://127.0.0.1:4000/api/ready` up to 15 times (5s apart)
4. **Success** → write `.deployed-sha` (the last known-good version) → 🟢
5. **Failure** → read `.deployed-sha` for the previous version, verify the
   image exists locally, then `IMAGE_TAG=<prev> up -d --no-build
   --force-recreate` (no rebuild — instant) → probe again → 🟠 on success,
   🚨 manual intervention on failure.

The previous image is never deleted before the new version is verified, so
rollback always targets a known-good version.

## Frontend / admin

Vercel handles instant rollback: a broken deploy is reverted from the Vercel
dashboard (Deployments → ⋯ → Rollback to previous). Deploy verification
workflows (`frontend-deploy.yml`, `admin-deploy.yml`) catch a bad deploy via
the smoke test and notify Telegram, so you know to roll back.

## Manual rollback (backend)

```bash
cd /opt/digital-smm
PREV=$(cat .deployed-sha)                    # last known-good sha
IMAGE_TAG="$PREV" docker compose -f docker-compose.prod.yml up -d --no-build --force-recreate backend
sleep 10 && curl http://127.0.0.1:4000/api/ready
```

## Database migrations

Never automatic. Backend changes that alter Mongo structure require a manual,
reviewed migration step before deploy (see `docs/deployment.md`). The deploy
script never drops collections or runs destructive DB commands.
