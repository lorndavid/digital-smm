# DigitalSMM — Development Workflow

## Prerequisites

- Node.js ≥ 20.9
- MongoDB (optional — the backend falls back to an in-memory Mongo server,
  but a real one is recommended for full behaviour)

## First-time setup

```bash
git clone git@github.com:lorndavid/digital-smm.git
cd digital-smm
npm ci                                  # single root lockfile, all workspaces

# Environment templates (never commit .env)
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
cp admin/.env.example admin/.env.local
```

`backend/.env` needs at least `MONGODB_URI` + two JWT secrets (the example
values in `.env.example` work for local dev; `SMM_PROVIDER=mock` and
`PAYMENT_PROVIDER=mock` need no keys).

## Run everything

```bash
npm run dev          # backend (:4000) + frontend (:5173) + admin (:5174)
```

Or individually: `npm run dev -w backend`, `npm run dev -w frontend`,
`npm run dev -w admin`.

## Local CI simulation (run these before pushing)

```bash
npm run typecheck                        # backend + frontend + admin
npm test                                 # backend unit/API tests (vitest)
cd frontend && CI=1 npm run test:e2e     # Playwright suite (75 tests) — needs Chromium:
                                         #   npx playwright install --with-deps chromium
npm run build                            # production builds of all three
```

## Useful commands

| Command | Purpose |
|---|---|
| `npm run build -w backend` | compile backend to `backend/dist` |
| `npm run test -w backend` | backend tests (watch: `test:watch`) |
| `npm run sync:catalog -w backend` | pull the SMM provider catalogue |
| `npm run seed:telegram -w backend` | seed curated Telegram services |
| `npm run create:super-admin -w backend` | create the first admin |
| `docker compose up -d` | local infra (mongo + redis + backend) |
| `curl http://localhost:4000/api/health` | backend liveness |
| `curl http://localhost:4000/api/version` | deployed version identity |
| `curl http://localhost:4000/api/ready` | readiness (deps) |

## Branch + PR flow

See `docs/git-workflow.md`. Summary: feature branch → typecheck + tests →
push → PR → CI (typecheck, unit, e2e, security scan) → merge to `main`.

## Docker (backend only)

```bash
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml logs -f backend
```

Version identity is baked via build args: `VERSION`, `COMMIT`, `BUILD_TIME`
→ exposed at `/api/version`.
