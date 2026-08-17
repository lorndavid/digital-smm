# 07 — Uptime Monitoring

> ⚠️ **Manual step.** These actions happen in an uptime-monitoring provider's
> dashboard — the AI agent cannot create the account for you. Nothing here has
> been configured.

## Goal

Watch the public endpoints and alert you when the site or API goes down.

## Options

- **UptimeRobot** (free tier, 50 monitors) — recommended to start.
- **Better Stack Uptime** (free tier).
- **Vercel + VPS native**: Cloudflare (02) also offers free health checks when
  proxying.

## Steps (UptimeRobot example)

1. **UptimeRobot** → https://uptimerobot.com → sign up.
2. **Add New Monitor** → HTTP(S).

| Monitor   | URL                                   | Interval | Alert contacts |
|-----------|---------------------------------------|----------|----------------|
| Site      | `https://digitalsmm.shop/`            | 5 min    | your email     |
| Admin     | `https://admin.digitalsmm.shop/`      | 5 min    | your email     |
| API liveness | `https://api.digitalsmm.shop/api/health` | 1 min | your email     |
| API readiness | `https://api.digitalsmm.shop/api/ready` | 1 min | your email     |

> Use **readiness** (`/api/ready`) for the API monitor — it fails (503) when
> MongoDB or Redis are unreachable, so you're alerted before real downtime.

3. Set alert contacts (email, Telegram, Slack) under **My Settings → Alert
   Contacts**.
4. Save each monitor.

## Expected result

- The monitors return 200 (site/admin/health) and 200 (ready) when healthy.
- You get an alert within minutes of an outage, and a recovery notification.

## Verify

- Dashboard shows all monitors **Up**.
- (Optional) temporarily stop the backend container:
  `docker compose stop backend` → within ~5 min you get a "down" alert →
  `docker compose start backend` → recovery alert.

## Gotchas

- Do not put secrets in monitor URLs (some providers log them).
- `/api/ready` returning 503 when Redis is configured-but-down is **correct**
  behaviour — it's what makes the monitor useful.
- For page-visibility monitoring (real-browser checks), Better Stack and
  UptimeRobot both offer paid "keyword"/browser checks — optional.
