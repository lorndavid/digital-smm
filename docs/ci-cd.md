# DigitalSMM — CI/CD

## Pipelines (`.github/workflows/`)

| Workflow | When | What it does |
|---|---|---|
| `ci.yml` | PRs + push to main | Typecheck (backend+frontend+admin) → unit tests → Playwright e2e (75 tests, Mongo service, mock providers). **Master gate: red CI = no merge, no deploy.** |
| `backend-deploy.yml` | Push to main touching `backend/**`, compose, Dockerfile, scripts | SSH → `git pull` → `scripts/backend-deploy.sh <sha>`: build immutable `digitalsmm-prod-backend:<sha>`, restart, **verify `/api/ready` (15×5s retries)**, auto-rollback to previous image on failure, Telegram at each step. Concurrency: one deploy at a time. |
| `frontend-deploy.yml` | Push to main touching `frontend/**` | Waits ~2 min for Vercel, smoke-tests `https://digitalsmm.shop` (HTTP 200), Telegram success/failure. Vercel owns the build. |
| `admin-deploy.yml` | Push to main touching `admin/**` | Same for `https://admin.digitalsmm.shop`. |
| `security-scan.yml` | PRs + push to main | Gitleaks secret scan (full history) + `npm audit --omit=dev --audit-level=high`; Telegram notify on failure. |
| `load-test.yml` | Manual (workflow_dispatch) | Heavy 100-user load tests — intentionally not automatic. |

## Deploy flow (backend)

```
push to main (backend/**)
  → backend-deploy.yml
    → SSH VPS: git pull --ff-only
    → bash scripts/backend-deploy.sh <sha>
        → build digitalsmm-prod-backend:<sha> (immutable)
        → up -d --force-recreate
        → probe /api/ready ×15
        → ok?        write .deployed-sha + 🟢 Telegram
        → not ok?    rollback: up --no-build --force-recreate with previous sha
                     (stored in .deployed-sha) → probe again → 🟠/🚨 Telegram
```

## Change detection

- Frontend/admin deploys are path-filtered (`frontend/**`, `admin/**`) so a
  backend-only change never redeploys the storefront, and vice-versa.
- CI (`ci.yml`) is deliberately NOT path-filtered — typechecking all three
  workspaces is cheap and catches cross-app breakage.

## Concurrency & safety

- `concurrency:` groups prevent overlapping production deploys
  (`deploy-backend-prod`, `deploy-frontend-prod`, `deploy-admin-prod`).
  A newer deploy cancels an obsolete pending one; a running rollback is
  never interrupted (the deploy script owns the rollback inside the same run).
- `environment: production` on deploy jobs enables GitHub Environments —
  optionally add **required reviewers** for manual approval (MANUAL REQUIRED).

## Secrets used by pipelines (MANUAL REQUIRED)

Add under GitHub → Settings → Secrets and variables → Actions:

| Secret | Used by |
|---|---|
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | all deploy + security workflows (via `scripts/notify-telegram.mjs`) |
| `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_SSH_PORT` (opt.) | `backend-deploy.yml` |
| `GITLEAKS_LICENSE` (opt.) | gitleaks action |

Variables (non-secret): `FRONTEND_PROD_URL`, `ADMIN_PROD_URL` (defaults to the
digitalsmm.shop URLs).
