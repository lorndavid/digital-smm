# DigitalSMM — Git Workflow

The repository is a **monorepo** (frontend + admin + backend, npm workspaces,
single lockfile). `main` is production: merging to it auto-deploys the
customer frontend + admin to Vercel and triggers the backend deploy workflow.

## Branching model

```
main  (production — protected, deploys on merge)
  └── feature/*     short-lived branches for any change
  └── fix/*         bug fixes
  └── chore/*       tooling / docs
```

No `develop`/`staging` branch is used: the existing single-branch flow with
CI + preview deployments is simpler and works. Production deployments never
happen from arbitrary branches — only pushes/PRs to `main` deploy.

## Rules

1. **Never push to `main` directly.** Every change goes through a PR.
2. **PRs must be green** (CI: typecheck + unit tests + e2e + security scan)
   before merging. Vercel also creates preview deployments for PRs.
3. **`.env` files are never committed** — they are gitignored. Use the
   `*.example` templates. Secrets live in the VPS `backend/.env`, Vercel
   project env vars, and GitHub Actions secrets.
4. **Commit `package-lock.json`** whenever dependencies change (use
   `npm install <pkg> -w <workspace>` so the single root lockfile updates).
5. **Backend deploys are manual-but-scripted**: after merging, the
   `backend-deploy.yml` workflow deploys to the VPS automatically. If it is
   disabled, run `bash scripts/backend-deploy.sh <sha>` on the VPS.

## Daily flow

```bash
git checkout main && git pull
git checkout -b feat/your-change
# ... code ...
npm run typecheck && npm test          # root scripts cover all workspaces
git add <changed files>                # review with `git status` first
git commit -m "feat: describe the WHY"
git push -u origin feat/your-change
# open a PR → wait for CI → review → merge → delete branch
```

## Branch protection (MANUAL REQUIRED — GitHub Settings)

Enable on `main`:

- ✅ Require a pull request before merging (1 approval)
- ✅ Require status checks: `test` (Typecheck & unit tests), `browser-test`
  (e2e), plus the `secrets` and `dependencies` jobs from Security Scan
- ✅ Require branches to be up to date
- ✅ Do not allow bypassing (keep `main` protected)
- ✅ Require review from Code Owners (`.github/CODEOWNERS`)

## CODEOWNERS

`.github/CODEOWNERS` assigns the project owner as reviewer for backend,
infrastructure, frontend and admin changes. Adjust the handles to your team.
