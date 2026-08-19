# DigitalSMM — Master Setup Guide

> **One document. Every step. No guessing.**
>
> Follow this guide top-to-bottom to go from zero to a fully working
> production system with CI/CD, monitoring, and automatic deploys.

---

## Architecture Overview

```
                         USERS
                           │
                           ▼
                     CLOUDFLARE
                    (DNS + SSL + CDN)
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
         www.shop     api.shop     admin.shop
         (Vercel)      (VPS)       (Vercel)
              │            │            │
         Frontend      Backend      Admin Panel
         Vue 3 SPA     Express 5    Vue 3 SPA
              │         Docker        │
              │        ┌──┴──┐        │
              │      Redis  MongoDB   │
              │     (cache) (Atlas)   │
              └────────►▲◄───────────┘
                   Cloudflare Tunnel
```

**Three deployment targets:**
| Component | Host | URL |
|-----------|------|-----|
| Customer frontend | Vercel | `https://digitalsmm.shop` |
| Admin panel | Vercel | `https://admin.digitalsmm.shop` |
| Backend API | VPS (Docker) | `https://api.digitalsmm.shop` |

---

## PHASE 1 — External Accounts (Manual)

Do these FIRST. Nothing in the code can proceed without them.

### Step 1.1: Domain Registration

- [ ] Buy `digitalsmm.shop` at a registrar (GoDaddy, Namecheap, Cloudflare, etc.)
- [ ] Note your registrar login — you'll need it for DNS

### Step 1.2: MongoDB Atlas (Database)

1. Go to https://www.mongodb.com/atlas → **Sign up free**
2. **Create a cluster** (M0 free tier is fine to start):
   - Cloud Provider: AWS (closest region to your VPS)
   - Tier: **Shared (Free)**
3. **Database Access** → Add a new database user:
   - Authentication: **Password**
   - Username: `digitalsmm`
   - Password: generate a strong one → **save it**
   - Built-in role: **Read and write to any database**
4. **Network Access** → Add IP Address:
   - Add your **VPS public IP** (find it: `curl ifconfig.me` on VPS)
   - Also add `0.0.0.0/0` temporarily for initial setup, then remove it
5. **Overview** → **Connect** → **Connect your application**:
   - Driver: **Node.js**, Version: **6.x or later**
   - Copy the connection string — it looks like:
     ```
     mongodb+srv://digitalsmm:<PASSWORD>@cluster0.xxxxx.mongodb.net/digitalsmm?retryWrites=true&w=majority&appName=Cluster0
     ```
   - **Replace `<PASSWORD>` with the real password**
   - **Save this string** — you'll need it in Step 3.1

### Step 1.3: Google Cloud (Authentication)

1. Go to https://console.cloud.google.com → **APIs & Services** → **Credentials**
2. **Create Credentials** → **OAuth client ID**:
   - Application type: **Web application**
   - Name: `DigitalSMM`
   - Authorized redirect URIs: add `https://digitalsmm.shop/auth/callback`
3. **Save** the **Client ID** and **Client Secret**

### Step 1.4: SMM Provider (wizsmm.com)

1. Go to https://wizsmm.com → **Register**
2. Go to **Account** page → copy your **API Key**
3. **Save it** — you'll need it in Step 3.1

### Step 1.5: Payment Provider (CutLuy — KHQR)

1. Go to https://cutluy.com → **Register**
2. **Dashboard** → **API keys** → copy the API key
3. **Dashboard** → **Webhooks** → create a webhook:
   - URL: `https://api.digitalsmm.shop/webhooks/cutluy`
   - Copy the **signing secret**
4. **Save both** — you'll need them in Step 3.1

### Step 1.6: Telegram Bot (Alerts)

1. Open Telegram → search **@BotFather** → send `/newbot`
2. Choose name: `DigitalSMM Alerts`
3. Choose username: `digitalsmm_alerts_bot` (must end in `bot`)
4. BotFather gives you a **token** — save it
5. Open your new bot → send any message (e.g. `hi`)
6. Open in browser:
   ```
   https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates
   ```
7. Find `"chat":{"id":...}` — copy the numeric ID (positive = personal chat, negative = group)
8. **Save both** — token and chat ID

### Step 1.7: Sentry (Error Monitoring)

1. Go to https://sentry.io → **Sign up**
2. Create **3 projects**:
   - Platform: **JavaScript** → name: `digitalsmm-frontend` → copy DSN
   - Platform: **JavaScript** → name: `digitalsmm-admin` → copy DSN
   - Platform: **Node.js** → name: `digitalsmm-backend` → copy DSN
3. **Save all 3 DSNs**

### Step 1.8: Vercel (Frontend Hosting)

1. Go to https://vercel.com → **Sign up with GitHub**
2. **Add New Project** → import your repo
3. Create **TWO projects** from the same repo:

   **Project 1: Customer Frontend**
   - Name: `digitalsmm-frontend`
   - Root directory: `frontend/`
   - Framework: **Vite**

   **Project 2: Admin Panel**
   - Name: `digitalsmm-admin`
   - Root directory: `admin/`
   - Framework: **Vite**

---

## PHASE 2 — GitHub Repository Setup

### Step 2.1: Push Code to GitHub

```bash
cd /path/to/digital-smm
git remote add origin git@github.com:YOUR_USERNAME/digital-smm.git
git branch -M main
git push -u origin main
```

### Step 2.2: GitHub Actions Secrets

Go to **GitHub → Settings → Secrets and variables → Actions → New repository secret**

Add these secrets:

| Secret | Value | Where to find it |
|--------|-------|-------------------|
| `TELEGRAM_BOT_TOKEN` | `123456789:AAH...` | Step 1.6 |
| `TELEGRAM_CHAT_ID` | `123456789` or `-100123...` | Step 1.6 |
| `VPS_HOST` | `123.45.67.89` | Your VPS IP address |
| `VPS_USER` | `ubuntu` | SSH username on VPS |
| `VPS_SSH_KEY` | `-----BEGIN OPENSSH PRIVATE KEY-----...` | Private SSH key (see Step 2.3) |

### Step 2.3: Generate SSH Deploy Key

On your **local machine** (not the VPS):

```bash
ssh-keygen -t ed25519 -f deploy-key -N "" -C "github-deploy"
# This creates deploy-key (private) and deploy-key.pub (public)
```

Copy the **private key** content (everything between the `BEGIN` and `END` lines) → paste as `VPS_SSH_KEY` in GitHub Secrets.

Copy the **public key** → add it to the VPS in Step 3.2.

### Step 2.4: Branch Protection

Go to **GitHub → Settings → Branches → Add rule** for `main`:

- [x] Require a pull request before merging
  - [x] Require approvals: **1**
- [x] Require status checks to pass:
  - `test` (Typecheck & unit tests)
  - `browser-test` (e2e)
- [x] Require branches to be up to date
- [x] Do not allow bypassing the above settings

### Step 2.5: GitHub Environments (Optional but Recommended)

Go to **GitHub → Settings → Environments → New environment**:

- Name: `production`
- Add **required reviewers** (yourself or team lead)
- This means deploys require manual approval in GitHub

---

## PHASE 3 — VPS Setup

### Step 3.1: Prepare VPS

SSH into your VPS:

```bash
ssh ubuntu@YOUR_VPS_IP
```

Install Docker:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# Log out and back in for group to take effect
```

Install Cloudflare Tunnel:

```bash
# Install cloudflared
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt update && sudo apt install -y cloudflared
```

### Step 3.2: Add Deploy Key to VPS

```bash
# Add the GitHub deploy public key
echo "PASTE_PUBLIC_KEY_HERE" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

Test: from your local machine:
```bash
ssh -i deploy-key ubuntu@YOUR_VPS_IP "echo 'SSH works!'"
```

### Step 3.3: Clone Repository on VPS

```bash
cd /opt
sudo git clone git@github.com:YOUR_USERNAME/digital-smm.git
sudo chown -R $USER:$USER /opt/digital-smm
cd /opt/digital-smm
```

### Step 3.4: Create Backend Environment File

```bash
cd /opt/digital-smm/backend
cp .env.example .env
nano .env
```

Fill in **every required value**:

```env
# ---- Server ----
NODE_ENV=production
PORT=4000

# ---- MongoDB Atlas ----
MONGODB_URI=mongodb+srv://digitalsmm:YOUR_ATLAS_PASSWORD@cluster0.xxxxx.mongodb.net/digitalsmm?retryWrites=true&w=majority&appName=Cluster0

# ---- DNS ----
DNS_SERVERS=1.1.1.1,8.8.8.8

# ---- Google OAuth ----
GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_CLIENT_SECRET
FRONTEND_URL=https://digitalsmm.shop
CUSTOMER_JWT_SECRET=GENERATE_A_RANDOM_32_BYTE_SECRET
CUSTOMER_JWT_EXPIRES_IN=7d

# ---- Admin Auth ----
ADMIN_JWT_SECRET=GENERATE_ANOTHER_RANDOM_32_BYTE_SECRET
ADMIN_JWT_EXPIRES_IN=12h
SUPER_ADMIN_EMAIL=your@email.com
SUPER_ADMIN_PASSWORD=choose_a_strong_password

# ---- CORS ----
CORS_ORIGINS=https://digitalsmm.shop,https://www.digitalsmm.shop,https://admin.digitalsmm.shop

# ---- SMM Provider ----
SMM_PROVIDER=smmwiz
SMMWIZ_API_URL=https://wizsmm.com/api/v2
SMMWIZ_API_KEY=YOUR_WIZSMM_API_KEY

# ---- Payment Provider ----
PAYMENT_PROVIDER=cutluy
CUTLUY_API_URL=https://cutluy.com/v1
CUTLUY_API_KEY=YOUR_CUTLUY_API_KEY
CUTLUY_WEBHOOK_SECRET=YOUR_CUTLUY_WEBHOOK_SECRET

# ---- Rate Limiting ----
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=3000
RATE_LIMIT_CATALOGUE_MAX=10000

# ---- Redis (required for caching + cross-instance SSE) ----
REDIS_URL=redis://redis:6379

# ---- Background Jobs ----
ENABLE_ORDER_SYNC_JOB=true
ORDER_SYNC_INTERVAL_MS=15000

# ---- Sentry (optional) ----
SENTRY_DSN=YOUR_BACKEND_SENTRY_DSN
SENTRY_ENVIRONMENT=production

# ---- Telegram Alerts ----
TELEGRAM_BOT_TOKEN=YOUR_TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID=YOUR_TELEGRAM_CHAT_ID
TELEGRAM_ALERTS_ENABLED=true
TELEGRAM_MIN_ALERT_LEVEL=warning
TELEGRAM_ALERT_COOLDOWN_MS=900000

# ---- Daily Report (10 PM Cambodia time) ----
DAILY_REPORT_ENABLED=true
DAILY_REPORT_TIME=22:00
DAILY_REPORT_TZ=Asia/Phnom_Penh

# ---- Admin Integrations ----
CREDENTIAL_ENCRYPTION_KEY=GENERATE_WITH: openssl rand -hex 32
ENABLE_INTEGRATION_HEALTH_JOB=true
INTEGRATION_HEALTH_INTERVAL_MS=1800000
```

**Generate secrets:**
```bash
# Run these to generate random secrets:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
openssl rand -hex 32
```

### Step 3.5: Build and Start Backend

```bash
cd /opt/digital-smm

# Build the Docker image
docker compose -f docker-compose.prod.yml build

# Start (backend + Redis)
docker compose -f docker-compose.prod.yml up -d

# Verify
docker compose -f docker-compose.prod.yml ps
# Both backend and redis should show "running" and "healthy"

curl http://127.0.0.1:4000/api/health
# Should return: {"status":"ok",...}

curl http://127.0.0.1:4000/api/ready
# Should return: {"status":"ok","dependencies":{"mongodb":"ok","redis":"ok"}}
```

### Step 3.6: Create Super Admin Account

```bash
cd /opt/digital-smm

# If you didn't set SUPER_ADMIN_EMAIL/PASSWORD in .env, create manually:
docker compose -f docker-compose.prod.yml exec backend \
  node dist/services/admin-auth.service.js create \
  --email your@email.com \
  --password your_strong_password
```

### Step 3.7: Setup Cloudflare Tunnel

```bash
# Authenticate with Cloudflare
sudo cloudflared service install YOUR_TUNNEL_TOKEN

# The token comes from:
# Cloudflare Zero Trust → Networks → Tunnels → Create a tunnel
# → Copy the install command (contains the token)
```

Configure the tunnel to route:
- `api.digitalsmm.shop` → `http://localhost:4000`

### Step 3.8: Sync SMM Provider Catalogue

```bash
cd /opt/digital-smm
docker compose -f docker-compose.prod.yml exec backend \
  node dist/services/admin.service.js sync-catalog
```

---

## PHASE 4 — Vercel Configuration

### Step 4.1: Customer Frontend (digitalsmm.shop)

Go to **Vercel → digitalsmm-frontend → Settings → Environment Variables**:

| Name | Value | Environments |
|------|-------|-------------|
| `VITE_API_BASE_URL` | `https://api.digitalsmm.shop` | Production |
| `VITE_APP_ENV` | `production` | Production |
| `VITE_GA_MEASUREMENT_ID` | `G-XXXXXXXXXX` | Production |
| `VITE_SENTRY_DSN` | Your frontend DSN | Production |

Go to **Settings → Domains**:
- Add `digitalsmm.shop`
- Add `www.digitalsmm.shop`

### Step 4.2: Admin Panel (admin.digitalsmm.shop)

Go to **Vercel → digitalsmm-admin → Settings → Environment Variables**:

| Name | Value | Environments |
|------|-------|-------------|
| `VITE_API_BASE_URL` | `https://api.digitalsmm.shop` | Production |
| `VITE_APP_ENV` | `production` | Production |
| `VITE_SENTRY_DSN` | Your admin DSN | Production |

Go to **Settings → Domains**:
- Add `admin.digitalsmm.shop`

---

## PHASE 5 — Cloudflare DNS

### Step 5.1: DNS Records

Go to **Cloudflare → digitalsmm.shop → DNS → Records**:

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | `@` | `76.76.21.21` | ON (orange cloud) |
| A | `www` | `76.76.21.21` | ON |
| A | `api` | `YOUR_VPS_IP` | ON |
| A | `admin` | `76.76.21.21` | ON |

### Step 5.2: SSL Settings

Go to **SSL/TLS → Overview** → set to **Full (strict)**

Go to **SSL/TLS → Edge Certificates** → enable **Always Use HTTPS**

---

## PHASE 6 — Post-Deploy Verification

Run these checks **in order**. Every check must pass before moving on.

### 6.1: Backend Health

```bash
# From your local machine:
curl -s https://api.digitalsmm.shop/api/health | python3 -m json.tool
# Expected: "status": "ok", "db": "connected"

curl -s https://api.digitalsmm.shop/api/ready | python3 -m json.tool
# Expected: "status": "ok", mongodb: "ok", redis: "ok"
```

### 6.2: Frontend

```bash
# Open in browser:
# https://digitalsmm.shop
# https://www.digitalsmm.shop
```

- [ ] Landing page loads
- [ ] Services/categories display
- [ ] Google Sign-In button works
- [ ] Sign-in completes successfully
- [ ] Dashboard loads after sign-in

### 6.3: Admin Panel

```bash
# Open in browser:
# https://admin.digitalsmm.shop
```

- [ ] Login page loads
- [ ] Can log in with super admin credentials
- [ ] Dashboard shows system status
- [ ] System Health shows MongoDB: OK, Redis: OK
- [ ] Services page loads
- [ ] Categories page loads

### 6.4: Payment Flow

- [ ] Create a test order
- [ ] KHQR code generates
- [ ] Payment status page shows
- [ ] After payment: status updates (via SSE, no refresh needed)

### 6.5: Google Search Console

- [ ] Add property `digitalsmm.shop`
- [ ] Verify ownership (DNS TXT record via Cloudflare)
- [ ] Submit sitemap: `https://digitalsmm.shop/sitemap.xml`
- [ ] Request indexing for the homepage

### 6.6: Uptime Monitoring

Set up monitoring at https://uptimerobot.com (free tier):

| Monitor | URL | Interval |
|---------|-----|----------|
| Backend Health | `https://api.digitalsmm.shop/api/health` | 5 min |
| Frontend | `https://digitalsmm.shop` | 5 min |
| Admin | `https://admin.digitalsmm.shop` | 5 min |

---

## PHASE 7 — Team Workflow

### Daily Development Flow

```bash
# 1. Start from main
git checkout main && git pull

# 2. Create feature branch
git checkout -b feat/your-feature

# 3. Run locally
npm run dev

# 4. Before pushing — run checks
npm run typecheck
npm test

# 5. Commit and push
git add <files>
git commit -m "feat: describe the WHY, not the what"
git push -u origin feat/your-feature

# 6. Open Pull Request on GitHub
# → CI runs automatically (typecheck + tests + e2e)
# → Vercel creates a preview deployment
# → Review → Merge to main

# 7. After merge to main:
# → Frontend auto-deploys to Vercel
# → Admin auto-deploys to Vercel
# → Backend auto-deploys to VPS (if GitHub Actions is configured)
```

### Pull Request Rules

- **Never push to `main` directly** — always use a PR
- **CI must be green** before merging (typecheck + tests + e2e)
- **1 approval required** from a code owner
- **Branch must be up to date** with main

### What Happens on Merge to `main`

| Files changed | What deploys |
|--------------|-------------|
| `frontend/**` | Vercel rebuilds customer frontend → Telegram 🟢 |
| `admin/**` | Vercel rebuilds admin panel → Telegram 🟢 |
| `backend/**` | SSH → VPS → build Docker image → restart → verify → Telegram 🟢 |
| `backend/**` fails | Auto-rollback to previous version → Telegram 🟠 |

### Manual Deploy (if needed)

```bash
# On the VPS:
cd /opt/digital-smm
git pull
bash scripts/backend-deploy.sh $(git rev-parse HEAD)
```

---

## PHASE 8 — Ongoing Operations

### Daily 10 PM Cambodia Report

Automatically sent to Telegram at 22:00 Asia/Phnom_Penh:
- System status (MongoDB, Redis, API)
- Deployments
- Orders, payments, revenue
- SMM provider health
- Open incidents

### Error Alerts

Automatically sent to Telegram when:
- Backend errors spike (deduplicated — 1 message per incident)
- MongoDB/Redis goes down
- Payment provider fails
- SMM provider fails
- Deployment fails or rolls back

### Manual Commands on VPS

```bash
# Check backend status
docker compose -f docker-compose.prod.yml ps

# View backend logs
docker compose -f docker-compose.prod.yml logs --tail=100 backend

# Restart backend
docker compose -f docker-compose.prod.yml up -d --force-recreate backend

# Check Redis
docker compose -f docker-compose.prod.yml exec redis redis-cli ping

# Rebuild after code change
cd /opt/digital-smm && git pull
docker compose -f docker-compose.prod.yml build backend
docker compose -f docker-compose.prod.yml up -d --force-recreate backend
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Could not resolve host: api.digitalsmm.shop` | DNS not propagated. Wait or check Cloudflare DNS records. |
| CORS error in browser | `CORS_ORIGINS` in `backend/.env` must include the exact origin (including `https://`). |
| Google Sign-In fails | Redirect URI in Google Cloud must exactly match `https://digitalsmm.shop/auth/callback`. |
| Payment webhook fails | CutLuy webhook URL must be `https://api.digitalsmm.shop/webhooks/cutluy` with correct signing secret. |
| Backend won't start | Check `docker compose -f docker-compose.prod.yml logs backend` for the missing env var. |
| Redis connection error | Verify `REDIS_URL=redis://redis:6379` in `backend/.env` and Redis container is running. |
| MongoDB connection error | Check `MONGODB_URI` — password must be URL-encoded if it contains special characters. Check Atlas Network Access allows your VPS IP. |
| Vercel build fails | Ensure `VITE_API_BASE_URL` is set in Vercel env vars. |
| Telegram alerts not received | Verify `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in both `backend/.env` and GitHub Secrets. |

---

## Complete Checklist

### External Accounts
- [ ] Domain registered (`digitalsmm.shop`)
- [ ] MongoDB Atlas cluster created
- [ ] Google Cloud OAuth client created
- [ ] wizsmm.com account + API key
- [ ] CutLuy account + API key + webhook secret
- [ ] Telegram bot created + token + chat ID
- [ ] Sentry projects created (frontend + admin + backend DSNs)
- [ ] Vercel account connected to GitHub

### GitHub
- [ ] Code pushed to `main`
- [ ] Actions secrets set (TELEGRAM, VPS_HOST, VPS_USER, VPS_SSH_KEY)
- [ ] Branch protection enabled on `main`
- [ ] `production` environment created (optional)

### VPS
- [ ] Docker installed
- [ ] cloudflared installed
- [ ] Repository cloned at `/opt/digital-smm`
- [ ] `backend/.env` created with ALL required values
- [ ] Backend container running and healthy
- [ ] Redis container running
- [ ] Cloudflare tunnel configured (api.digitalsmm.shop → :4000)

### Vercel
- [ ] Frontend project created with env vars
- [ ] Admin project created with env vars
- [ ] Custom domains added (digitalsmm.shop, admin.digitalsmm.shop)

### Cloudflare
- [ ] DNS records added (A records for @, www, api, admin)
- [ ] SSL set to Full (strict)
- [ ] Always Use HTTPS enabled

### Verification
- [ ] `https://api.digitalsmm.shop/api/health` → ok
- [ ] `https://api.digitalsmm.shop/api/ready` → mongodb ok, redis ok
- [ ] `https://digitalsmm.shop` loads
- [ ] `https://admin.digitalsmm.shop` loads
- [ ] Google Sign-In works
- [ ] Payment flow works
- [ ] Telegram alerts received

### Ongoing
- [ ] Uptime monitoring configured
- [ ] Google Search Console property added
- [ ] Sitemap submitted
- [ ] Team knows the git workflow
