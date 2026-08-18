# DigitalSMM — Troubleshooting

## Symptom → fix table

| Symptom | Likely cause | Fix |
|---|---|---|
| Backend crash loop: `MongoParseError: Invalid scheme` | malformed `MONGODB_URI` in `backend/.env` | Must start with `mongodb+srv://` and be `user:password@host`. Fix and `up -d --force-recreate`. |
| `querySrv ECONNREFUSED` | ISP/VPS DNS can't resolve Atlas SRV | Set `DNS_SERVERS=1.1.1.1,8.8.8.8` in `backend/.env`, recreate. |
| Atlas auth/timeout after fixing URI | VPS IP not in Atlas Network Access | Atlas → Security → Network Access → add the VPS public IP. |
| Webhook 404 in CutLuy dashboard | wrong path | Must be `https://api.digitalsmm.shop/webhooks/cutluy` (no `/api`). |
| `[cutluy-webhook] rejected: signature mismatch` | secret mismatch | `CUTLUY_WEBHOOK_SECRET` must equal the dashboard secret byte-for-byte. |
| Frontend calls `/auth/me` (404, no `/api`) | stale bundle or wrong base | Hard-refresh; `VITE_API_BASE_URL` normalized by the client — set to `https://api.digitalsmm.shop` in Vercel. |
| CORS blocked for `www.digitalsmm.shop` | `CORS_ORIGINS` missing the `www` origin | Include both apex + `www` + admin origins; recreate container. |
| `Failed to fetch dynamically imported module` | stale tab after redeploy | Hard-refresh once; the router auto-recovers in production (one reload). |
| `Unable to reach the origin service` in cloudflared logs | backend not up yet at boot | Transient; verify `docker compose ps` shows Up + `curl 127.0.0.1:4000/api/health`. |
| API only works on some networks | ISP DNS negative cache | Router DNS → 1.1.1.1/8.8.8.8; self-heals in ≤48 h; Cloudflare TTLs are Auto. |
| Telegram alerts not arriving | not configured | Check boot log: `[notifications] Telegram alerts configured and enabled`; set `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`. |
| No daily report at 22:00 | disabled or not configured | `DAILY_REPORT_ENABLED=true` + Telegram config; check `[job] daily report scheduled at 22:00 (Asia/Phnom_Penh)`. |
| Deploy fails health check, auto-rollback kicks in | bad image | Read the workflow/script output; check `docker logs`; fix and redeploy. |

## Logs

```bash
docker compose -f docker-compose.prod.yml logs -f backend          # app
sudo journalctl -u cloudflared -n 100 --no-pager                   # tunnel
```

Every request has a `requestId` in the structured logs — paste it when
reporting issues (see `docs/monitoring.md`).

## Incident → recovery loop

1. Failure event → incident `open` (admin → System → Incidents).
2. Telegram alert (deduplicated) with service/event/version/commit.
3. Deploy failures auto-rollback (backend) or are caught by smoke tests
   (frontend/admin).
4. Recovery → resolve the incident in the admin panel (or code path
   `resolveAlert`), Telegram 🟢 recovery message.
