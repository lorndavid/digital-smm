# DigitalSMM — Production Deployment Guide

Complete step-by-step runbook for putting DigitalSMM live:

| Piece | Where it runs | URL |
|---|---|---|
| Customer frontend | Vercel (static SPA) | `https://digitalsmm.shop` |
| Admin panel | Vercel (static SPA) | `https://admin.digitalsmm.shop` |
| Backend API | Daun Penh VPS (Docker — one container) | `https://api.digitalsmm.shop` |
| Database | MongoDB Atlas | — |
| CDN / TLS / Tunnel | Cloudflare | — |

---

## Architecture

```
                    INTERNET
                       │
                       ▼
                  CLOUDFLARE  (DNS / SSL / WAF)
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
 digitalsmm.shop   admin.digitalsmm.shop   api.digitalsmm.shop
        │              │              │
        ▼              ▼              ▼
      Vercel         Vercel       Cloudflare Tunnel
                                         │
                                         ▼
                              ┌─────────────────────┐
                              │       VPS           │
                              │    Ubuntu 22.04     │
                              │                     │
                              │ Docker              │
                              │  └─ DigitalSMM API  │  (127.0.0.1:4000)
                              │                     │
                              │ cloudflared         │
                              └──────────┬──────────┘
                                         │
                                         ▼
                                  MongoDB Atlas
```

The VPS runs **only** Docker + cloudflared. No MongoDB, no Redis, no PM2, no Node on the
host, no nginx, no frontend/admin (those live on Vercel). MongoDB is Atlas (cloud).

**Why the API is cross-origin (`api.digitalsmm.shop`) instead of proxying `/api` on Vercel:**
the payment page streams live status over SSE (`/api/payment/events`), a long-lived
connection. Vercel's proxy buffers/timeouts long streams. A direct browser → tunnel
connection keeps SSE, webhooks and polling reliable. The backend already supports this:
CORS is configured (`backend/src/app.ts`), `app.set('trust proxy', 1)` is set, and SSE
responses send `Cache-Control: no-cache` + `X-Accel-Buffering: no`.

---

## Prerequisites (checklist)

- [ ] GitHub repo `lorndavid/digital-smm` (private) — push all changes before starting
- [ ] Domain `digitalsmm.shop` registered (GoDaddy) — nameservers pointed at Cloudflare
- [ ] Cloudflare account + zone `digitalsmm.shop` added (free plan)
- [ ] Vercel account (free Hobby plan)
- [ ] Daun Penh VPS (DPDC) ordered — Ubuntu 22.04 LTS, 1 vCPU / 2 GB RAM / 20 GB NVMe is enough (swap in Part 4.7)
- [ ] MongoDB Atlas cluster (already in use)
- [ ] Google OAuth client ID + secret (already in use)
- [ ] CutLuy API key + webhook secret (already in use)
- [ ] wizsmm API key (already in use)

The repo is **already Docker-ready**:
- `backend/Dockerfile` — Node 20 Alpine, root-lockfile `npm ci`, compiled `dist` runtime image
- `docker-compose.prod.yml` — the production file for the VPS (validated + image tested locally)
- `backend/.env.production.example` — template for `backend/.env` (every var the backend reads)

---

# PART 1 — Cloudflare first

The domain is registered at GoDaddy and its nameservers were already changed to
Cloudflare (`aida.ns.cloudflare.com`, `hayes.ns.cloudflare.com`). Confirm propagation:

1. Open **https://dnschecker.org** → query `digitalsmm.shop` → **NS**.
2. All green = the zone is live on Cloudflare. Red/yellow = wait (changes can take up to 24–48 h).
3. In **Cloudflare dashboard** → **Add site** → `digitalsmm.shop` → **Free plan** → Cloudflare
   shows the two nameservers for your account (they should match what GoDaddy already has).

All DNS records are created in **Part 2 / Part 3 / Part 4** below. Only three hosts exist in
this design: `digitalsmm.shop` (Vercel), `admin.digitalsmm.shop` (Vercel), `api.digitalsmm.shop`
(Cloudflare Tunnel).

---

# PART 2 — Customer frontend → Vercel

### 2.1 Commit the Vercel SPA config (already created in the repo)

`frontend/vercel.json` and `admin/vercel.json` contain the SPA fallback rewrite so deep
links like `/dashboard/orders` work when the page is refreshed, plus a router-level
auto-reload for stale-tab chunk errors after redeploys.

### 2.2 Import the project

1. **https://vercel.com** → sign in **with GitHub** (free Hobby plan).
2. **Add New → Project → Import** the `digital-smm` repository.
3. Configure:

   | Setting | Value |
   |---|---|
   | Framework Preset | Vite |
   | Root Directory | `frontend` |
   | Build Command | `npm run build` |
   | Output Directory | `dist` |

   Vercel detects the npm workspace and installs dependencies from the root
   `package-lock.json` automatically.

4. **Environment Variables** (Production; add the same to Preview if you want previews to work):
   ```
   VITE_API_BASE_URL=https://api.digitalsmm.shop/api
   ```
   > Must include the `/api` path — the app's request paths never carry it. The client also
   > accepts the bare host (`https://api.digitalsmm.shop`) and appends `/api` itself.
   > `VITE_*` vars are baked at build time — changing them requires a re-deploy (Vercel does it automatically).

5. **Deploy** → wait ~1–2 min → open the generated `*.vercel.app` URL and confirm it renders.

### 2.3 Add the custom domain

1. Vercel → project → **Settings → Domains → Add** → `digitalsmm.shop` → **Add**.
2. Vercel shows the required DNS record — create it in Cloudflare (next step), then click **Refresh** until **Valid**.

### 2.4 DNS record (Cloudflare zone `digitalsmm.shop`)

| Type | Name | Value | Proxy |
|---|---|---|---|
| CNAME | `digitalsmm.shop` | `cname.vercel-dns.com` | 🔘 grey (off) |
| CNAME | `www` | `cname.vercel-dns.com` | 🔘 grey (off) |

> **Must be grey-cloud.** Vercel terminates TLS itself and issues the certificate.
> Cloudflare orange-cloud on the frontend records breaks Vercel's cert validation.

Wait for propagation (dnschecker.org), then https://digitalsmm.shop serves the app with HTTPS.

### 2.5 Google OAuth — production redirect

1. Google Cloud Console → **APIs & Services → Credentials** → your OAuth client.
2. **Authorized redirect URIs** → add:
   ```
   https://digitalsmm.shop/auth/callback
   ```
   Keep `http://localhost:5173/auth/callback` for local dev.
3. **OAuth consent screen**: while in *Testing* mode only listed test users can sign in. To let
   every Gmail in, click **Publish app → Confirm**.

---

# PART 3 — Admin panel → Vercel

1. Vercel → **Add New → Project** → import the same repo.
2. Configure:

   | Setting | Value |
   |---|---|
   | Framework Preset | Vite |
   | Root Directory | `admin` |
   | Build Command | `npm run build` |
   | Output Directory | `dist` |

3. Environment Variables:
   ```
   VITE_API_BASE_URL=https://api.digitalsmm.shop/api
   ```
4. **Deploy** → test the `*.vercel.app` URL (super admin email + password — seeded in Part 4).
5. **Settings → Domains** → add `admin.digitalsmm.shop`.
6. Cloudflare DNS:

   | Type | Name | Value | Proxy |
   |---|---|---|---|
   | CNAME | `admin` | `cname.vercel-dns.com` | 🔘 grey (off) |

7. Confirm **Valid** in Vercel + HTTPS on https://admin.digitalsmm.shop.

---

# PART 4 — Backend → Daun Penh VPS (Docker + Cloudflare Tunnel)

> Run these **in order, in checkpoints**. Do not skip ahead. Stop and fix if any
> checkpoint fails before continuing.

### 4.1 Order the VPS

- **https://dpdatacenter.com** (or the panel at **https://subscription.dpdatacenter.com/dashboard**)
- Recommended: **Ubuntu 22.04 LTS, 1 vCPU, 2 GB RAM, 20 GB NVMe** (swap added in 4.7).
- After ordering, the panel shows: **IP address**, **root password** (or SSH key), and a **VNC console**.

### 4.2 First login + base setup

```bash
ssh root@YOUR_VPS_IP        # Windows: PowerShell ssh, or PuTTY / the panel's VNC console
whoami && cat /etc/os-release && nproc && free -h && df -h

apt update && apt upgrade -y
apt install -y ca-certificates curl git unzip nano htop ufw
sudo reboot                 # then reconnect
```

### 4.3 Firewall — SSH only

```bash
ufw allow OpenSSH
ufw enable
ufw status                  # OpenSSH allowed; nothing else
```

Do **not** open 4000/3000/5173/5174. Cloudflare Tunnel connects *outbound* from the server,
so the API never needs a public port. Docker-published ports can bypass UFW anyway — that's
why the compose binds `127.0.0.1` only.

### 4.4 Swap (safety buffer on 2 GB RAM)

```bash
swapon --show || true
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' | tee -a /etc/fstab
free -h
```

### 4.5 SSH key login (then disable passwords)

On your **Windows PC** (PowerShell):

```powershell
ssh-keygen -t ed25519 -C "digitalsmm-vps"
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub
```

On the VPS, paste the public key:

```bash
mkdir -p ~/.ssh && nano ~/.ssh/authorized_keys
chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys
```

Test key login from a **new** PowerShell window. Only then disable passwords:

```bash
nano /etc/ssh/sshd_config     # PasswordAuthentication no  (PubkeyAuthentication yes)
sshd -t && systemctl restart ssh
```

### 4.6 Install Docker (official repo)

```bash
apt update
apt install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
tee /etc/apt/sources.list.d/docker.sources > /dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
docker --version && docker compose version
```

Let `ubuntu` use Docker without sudo:

```bash
usermod -aG docker $USER
# exit, reconnect, then:
docker run --rm hello-world     # expect "Hello from Docker!"
```

### 4.7 Clone the repo (private repo → deploy key)

On the VPS:

```bash
mkdir -p /opt/digital-smm && chown $USER:$USER /opt/digital-smm && cd /opt/digital-smm
ssh-keygen -t ed25519 -C "digitalsmm-vps" -f ~/.ssh/digitalsmm_vps
cat ~/.ssh/digitalsmm_vps.pub
```

GitHub → repo → **Settings → Deploy keys → Add deploy key** → paste the public key.
**Do NOT enable "Allow write access"** — the VPS only pulls.

```bash
cat >> ~/.ssh/config <<EOF
Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/digitalsmm_vps
    IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config
ssh -T git@github.com          # expect "Hi lorndavid/digital-smm!"
git clone git@github.com:lorndavid/digital-smm.git .
git status && git remote -v
```

> **Do NOT run `npm install` on the host.** The Docker image installs its own Node
> dependencies. Your VPS is just Docker + a source checkout.

### 4.8 Validate the compose file (checkpoint — stop if this errors)

```bash
cd /opt/digital-smm
docker compose -f docker-compose.prod.yml config --services   # expect: backend
docker compose -f docker-compose.prod.yml config              # validates; stop on error
```

### 4.9 Production env — `/opt/digital-smm/backend/.env`

```bash
cp backend/.env.production.example backend/.env
nano backend/.env          # fill in real values
chmod 600 backend/.env
```

```dotenv
NODE_ENV=production
PORT=4000

# MongoDB Atlas — same connection string used locally
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/digitalsmm

# Only if Atlas SRV lookups fail on the VPS (the c-ares issue seen on Windows):
DNS_SERVERS=1.1.1.1,8.8.8.8

# Google OAuth
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxx
FRONTEND_URL=https://digitalsmm.shop
CUSTOMER_JWT_SECRET=<random 32+ chars — openssl rand -hex 32>
CUSTOMER_JWT_EXPIRES_IN=7d

# Admin auth
ADMIN_JWT_SECRET=<random 32+ chars — a DIFFERENT openssl rand -hex 32>
ADMIN_JWT_EXPIRES_IN=12h
SUPER_ADMIN_EMAIL=you@email.com
SUPER_ADMIN_PASSWORD=<strong password — seeds the first super admin on boot>

# CORS — Vercel origins (INCLUDE www — Vercel serves both apex and www,
# and a browser on www.digitalsmm.shop sends that exact origin) + localhost for dev
CORS_ORIGINS=https://digitalsmm.shop,https://www.digitalsmm.shop,https://admin.digitalsmm.shop,http://localhost:5173,http://localhost:5174

# SMM provider (wizsmm real API)
SMM_PROVIDER=smmwiz
SMMWIZ_API_URL=https://wizsmm.com/api/v2
SMMWIZ_API_KEY=<your key>

# Payment provider (CutLuy — real Bakong KHQR)
PAYMENT_PROVIDER=cutluy
CUTLUY_API_URL=https://cutluy.com/v1
CUTLUY_API_KEY=ck_live_xxx
CUTLUY_WEBHOOK_SECRET=whsec_xxx

# Order-sync job — 15s provider sync → near-real-time order status/remains
ENABLE_ORDER_SYNC_JOB=true
ORDER_SYNC_INTERVAL_MS=15000

# Leave REDIS_URL empty — single instance uses the in-memory SSE bus + rate limiter
```

> `CUTLUY_WEBHOOK_SECRET` must be **byte-for-byte identical** to the secret in the CutLuy
> dashboard webhook settings (see Part 5.2). The webhook URL is
> `https://api.digitalsmm.shop/webhooks/cutluy` — no `/api` prefix.

### 4.10 MongoDB Atlas — network access

Atlas → **Security → Network Access → Add IP Address** → add the **VPS public IP**
(keep the home IP too). Do **not** use `0.0.0.0/0`. If the VPS IP ever changes, update
this or the backend can't connect.

### 4.11 Build + start the backend (Docker)

```bash
cd /opt/digital-smm
docker compose -f docker-compose.prod.yml build    # first build takes a few minutes on 1 vCPU
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps       # backend -> Up (healthy)
docker compose -f docker-compose.prod.yml logs --tail=100 backend
```

Checkpoint — **the backend must answer before any Cloudflare work**:

```bash
curl http://127.0.0.1:4000/api/health
# {"status":"ok","service":"digitalsmm-backend","db":"connected",...}
```

If it fails: `docker compose -f docker-compose.prod.yml logs --tail=200 backend` and fix
before continuing. Common causes: wrong `MONGODB_URI`, Atlas IP not allowlisted,
`querySrv ECONNREFUSED` (→ set `DNS_SERVERS=1.1.1.1,8.8.8.8`), missing JWT secrets.

`restart: unless-stopped` is already in the compose file — Docker brings the backend back
after reboots automatically.

### 4.12 Cloudflare Tunnel (dashboard / token method)

1. Cloudflare dashboard → **Zero Trust → Networks → Tunnels → Create a tunnel** → **Cloudflared** → name `digitalsmm-production`.
2. Skip the connector-install screen; copy the **install token** (`eyJhIjoi...`). **Never paste the token into chat.**
3. On the VPS:

   ```bash
   curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o /tmp/cf.deb
   apt install -y /tmp/cf.deb
   cloudflared --version
   sudo cloudflared service install eyJhIjoi...
   systemctl enable cloudflared && systemctl start cloudflared
   systemctl status cloudflared      # active (running)
   ```

4. Back in the dashboard → tunnel `digitalsmm-production` → **Public Hostname / Routes → Add**:

   | Field | Value |
   |---|---|
   | Hostname | `api.digitalsmm.shop` |
   | Service | `HTTP` → `http://localhost:4000` |

   Wait until the tunnel shows **Healthy**, then:

   ```bash
   curl https://api.digitalsmm.shop/api/health
   # same JSON as the localhost check
   ```

### 4.13 Reboot test (production-style proof)

```bash
sudo reboot
# reconnect:
docker compose -f docker-compose.prod.yml ps
systemctl status cloudflared
curl https://api.digitalsmm.shop/api/health
```

All four must pass **without manually starting anything** — Docker auto-start ✓,
backend auto-start (`restart: unless-stopped`) ✓, cloudflared auto-start ✓, API public ✓.

---

# PART 5 — Final wiring

### 5.1 Complete Cloudflare DNS table

| Type | Name | Value | Proxy |
|---|---|---|---|
| CNAME | `digitalsmm.shop` | `cname.vercel-dns.com` | grey |
| CNAME | `www` | `cname.vercel-dns.com` | grey |
| CNAME | `admin` | `cname.vercel-dns.com` | grey |
| CNAME | `api` | `<tunnel-id>.cfargotunnel.com` | orange (auto-created) |

### 5.2 CutLuy webhook

CutLuy dashboard → webhook → **exactly**:

```
https://api.digitalsmm.shop/webhooks/cutluy
```

No `/api` prefix. The webhook secret in CutLuy must equal `CUTLUY_WEBHOOK_SECRET` in
`backend/.env`. (This URL never changes when you redeploy — the tunnel hostname is permanent.)

### 5.3 Google OAuth (done in 2.5)

- Redirect URI: `https://digitalsmm.shop/auth/callback`
- App published (or test users listed while in Testing mode).

---

# PART 6 — Go-live verification (do this in order)

### 6.1 Infrastructure

```bash
# VPS
docker compose -f docker-compose.prod.yml ps                 # backend Up (healthy)
curl http://127.0.0.1:4000/api/health                        # local backend up
systemctl status cloudflared                                 # tunnel connector running
curl https://api.digitalsmm.shop/api/health                  # tunnel up + DNS resolving
docker compose -f docker-compose.prod.yml logs --tail=50 backend | grep -i "order-sync"
# [job] order-sync scheduled every 15000ms
```

### 6.2 Domains

- [ ] https://digitalsmm.shop loads (frontend, HTTPS)
- [ ] https://admin.digitalsmm.shop loads (admin, HTTPS)
- [ ] Deep link refresh works: https://digitalsmm.shop/dashboard/orders (SPA fallback)
- [ ] https://api.digitalsmm.shop/api/health responds

### 6.3 Customer flow (real money — start with a $10 top-up)

1. https://digitalsmm.shop → **Sign in with Google** → dashboard.
2. Explore → pick a service → **Order** (wallet-funded) → order created at wizsmm.
3. **Wallet → Top up → $10** → KHQR modal opens (real CutLuy QR).
4. Scan with the **Bakong app** → expect:
   - modal flips to **"Payment detected — confirming…"**,
   - then **"Payment Successful 🎉"** (via SSE through the tunnel — no refresh),
   - wallet balance shows the credit,
   - order moves **Paid → Processing → In progress → Completed** (order-sync every 15s).
5. Check `docker compose -f docker-compose.prod.yml logs -f backend` for the webhook + fulfilment lines.

### 6.4 Admin flow

1. https://admin.digitalsmm.shop → super admin login.
2. Dashboard stats load; Orders / Users / Payments pages work.
3. Admin → Services → **Sync services from provider** pulls the wizsmm catalogue.

---

# PART 7 — Operations & troubleshooting

### Update the backend later

```bash
cd /opt/digital-smm
git pull
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps
```

Deployment cycle: **local dev → GitHub → git pull → docker compose build → up -d**.

### Logs & health

```bash
docker compose -f docker-compose.prod.yml logs -f backend    # live backend logs
docker compose -f docker-compose.prod.yml ps                 # container status
docker stats                                                 # CPU/RAM per container
journalctl -u cloudflared -n 100 --no-pager                  # tunnel logs
free -h && df -h                                             # RAM + disk
```

| Symptom | Fix |
|---|---|
| `https://api.../api/health` hangs | `systemctl status cloudflared`; dashboard tunnel **Healthy**? `ufw status` (only SSH open is fine — tunnel is outbound) |
| Backend boot fails `querySrv ECONNREFUSED` | Set `DNS_SERVERS=1.1.1.1,8.8.8.8` in `backend/.env`, restart container |
| Container exits immediately | `docker compose -f docker-compose.prod.yml logs --tail=200 backend` — check `MONGODB_URI`, JWT secrets (min 16 chars), Atlas allowlist |
| Google sign-in `redirect_uri_mismatch` | Google Console redirect URI must be exactly `https://digitalsmm.shop/auth/callback` |
| Frontend API 404s on every call | `VITE_API_BASE_URL` must include `/api` (e.g. `https://api.digitalsmm.shop/api`) + redeployed |
| CORS error in browser console | `CORS_ORIGINS` includes the exact origin, no trailing slash |
| Webhook not arriving | CutLuy URL exactly `https://api.digitalsmm.shop/webhooks/cutluy`; secret matches; check backend logs for `[cutluy-webhook]` lines |
| Backend can't reach Atlas from VPS | VPS IP added to Atlas Network Access; `DNS_SERVERS` set |
| Build OOM | Swap added (Part 4.4); retry `docker compose build` |
| Widespread 429s | `trust proxy` is already set; raise `RATE_LIMIT_MAX` if Cloudflare IPs share a quota |

**Never run** `docker system prune -a --volumes` on production — it can delete data.
The compose file uses no named volumes (all state lives in Atlas), so even a container
recreate is safe — but keep the prune off.

---

## Costs

| Service | Cost |
|---|---|
| Vercel Hobby | free |
| Cloudflare (zone + tunnel) | free |
| MongoDB Atlas | current plan |
| Daun Penh VPS (1 vCPU / 2 GB) | ~$5–10/mo (the only new cost) |

---

## Optional: dry-run the backend with Docker on your own computer first

Before buying anything, test the **exact production image** locally (already verified —
it boots with `db: connected`):

```bash
# 1. local throwaway Mongo
docker run -d --name mongo-test -p 127.0.0.1:27018:27017 mongo:7

# 2. build the production image
docker compose -f docker-compose.prod.yml build

# 3. run it with mock providers (no real keys) against that Mongo
docker run -d --name api-test -p 127.0.0.1:4001:4000 \
  -e NODE_ENV=production -e PORT=4000 \
  -e MONGODB_URI=mongodb://host.docker.internal:27018/digitalsmm_test \
  -e PAYMENT_PROVIDER=mock -e SMM_PROVIDER=mock -e ENABLE_ORDER_SYNC_JOB=false \
  -e CUSTOMER_JWT_SECRET=test-customer-secret-32-char-minimum \
  -e ADMIN_JWT_SECRET=test-admin-secret-32-char-minimum \
  digitalsmm-prod-backend

curl http://127.0.0.1:4001/api/health
# {"status":"ok","service":"digitalsmm-backend","db":"connected",...}
```

> On Windows/macOS Docker Desktop, `host.docker.internal` reaches your host from inside a
> container (`127.0.0.1` inside a container is the container itself). On the VPS you use the
> Atlas `mongodb+srv://` URL instead, so this only matters for local testing.

Then point a Cloudflare Tunnel at `http://localhost:4000` to test webhooks + the Vercel
frontends against the container before the VPS is involved. When you move to the VPS, stop
the home connector first (one hostname = one connector at a time) and install the same
tunnel there — `api.digitalsmm.shop` never changes, so no DNS/webhook/Google config is
touched by the move.
