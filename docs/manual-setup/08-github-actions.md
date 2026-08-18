# Manual Setup — GitHub Actions

> Everything in this file is **MANUAL REQUIRED** — the workflow files are
> CODE READY in the repository, but GitHub settings and secrets must be
> configured by an account owner.

## 1. Secrets (Settings → Secrets and variables → Actions)

| Secret | Required for | How to get |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | all deploy + security notifications | @BotFather → /newbot → token |
| `TELEGRAM_CHAT_ID` | same | message the bot, then `https://api.telegram.org/bot<TOKEN>/getUpdates` → `chat.id` |
| `VPS_HOST` | backend deploy | your VPS IP or hostname |
| `VPS_USER` | backend deploy | SSH user (e.g. `ubuntu`) |
| `VPS_SSH_KEY` | backend deploy | the PRIVATE ed25519 key whose public half is in the VPS `authorized_keys` (or a separate deploy key). Paste the whole private key including headers. |
| `VPS_SSH_PORT` (optional) | backend deploy | default `22` |
| `GITLEAKS_LICENSE` (optional) | security scan | only needed for org-wide gitleaks usage |

Optional variables (non-secret): `FRONTEND_PROD_URL`, `ADMIN_PROD_URL`
(defaults are `https://digitalsmm.shop` / `https://admin.digitalsmm.shop`).

## 2. Branch protection (Settings → Branches → main → Add rule)

- ✅ Require a pull request before merging (1 review)
- ✅ Require status checks to pass:
  - `test` (Typecheck & unit tests)
  - `browser-test` (e2e)
  - `secrets` and `dependencies` (Security Scan)
- ✅ Require branches to be up to date
- ✅ Require review from Code Owners (uses `.github/CODEOWNERS`)

## 3. GitHub Environments (optional hardening)

Create a `production` environment (Settings → Environments → New
environment) and add **required reviewers**. Deploy jobs
(`backend-deploy.yml`, `frontend-deploy.yml`, `admin-deploy.yml`) declare
`environment: production`, so deploys will wait for an explicit approval.

## 4. Verify the workflows parse

After the next push, check **Actions** shows the new workflows
(`Backend Deploy (production)`, `Frontend Deploy (verify + notify)`,
`Admin Deploy (verify + notify)`, `Security Scan`). Red "workflow parse"
failures mean a YAML problem — fix and re-push.

## 5. First backend deploy — preflight checklist

- [ ] `VPS_HOST` / `VPS_USER` / `VPS_SSH_KEY` set and the key can SSH in
      (`ssh -i key ubuntu@<host>` works locally)
- [ ] The VPS has the repo at `/opt/digital-smm` with a working
      `backend/.env` and Docker (see `guide-deployment.md` Part 4)
- [ ] Telegram secrets set (otherwise notifications are skipped — deploys
      still run)
- [ ] `.deployed-sha` will be created on first successful deploy; rollback
      needs at least two successful deploys to have a previous image
