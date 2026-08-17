# 04 — Google Analytics

> ⚠️ **Manual step.** These actions happen in the Google Analytics dashboard —
> the AI agent cannot perform them for you. Nothing here has been configured.

## Goal

Create a GA4 property and get a **Measurement ID** (`G-XXXXXXXXXX`) to put in
`VITE_GA_MEASUREMENT_ID`.

## Steps

1. **Google Analytics** → https://analytics.google.com → **Admin** (gear, bottom
   left) → **Create Property**.
2. Property name: `DigitalSMM` → reporting time zone: `Asia/Phnom_Penh` →
   currency: **USD** → **Create**.
3. In the property → **Data streams** → **Add stream** → **Web**.
4. Enter the site URL (`https://digitalsmm.shop`) + stream name (`Customer SPA`).
5. The stream page shows **Measurement ID** (e.g. `G-ABC123XYZ`). Copy it.
6. (Recommended) Create a second stream for `staging.digitalsmm.shop` if you run
   staging, and keep a separate Measurement ID for staging so production data
   stays clean.

## Configure in the repo

```env
# frontend/.env (or Vercel env var)
VITE_GA_MEASUREMENT_ID=G-ABC123XYZ
VITE_APP_ENV=production
```

## Expected result

- The frontend loads gtag.js once (see `frontend/src/analytics/`), and the
  router sends `page_view` events on every route change.
- Events listed in docs/analytics-events.md appear in GA4.

## Verify

1. Redeploy the frontend with the measurement id set.
2. Open `https://digitalsmm.shop` in an incognito tab.
3. GA4 → **Reports → Realtime** → you should see the page view within seconds.
4. Trigger an event (search, order start) and confirm it appears in Realtime.

## Gotchas

- `VITE_GA_MEASUREMENT_ID` is a **public** value (inlined into the bundle) —
  that is expected and safe.
- GA4 does not backfill — events only start after the id is set and the app
  redeployed.
