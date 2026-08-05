/**
 * Browser test backend — booted by Playwright's webServer config.
 *
 * Serves the REAL app (createApp) on port 4001 with:
 *   - PAYMENT_PROVIDER=mock  → real QR images, no API keys, no real charges
 *   - SMM_PROVIDER=mock      → no SMMWiz API calls
 *   - mock frozen at 'pending' (MOCK_PAYMENT_*_MS huge) so the ONLY way a
 *     payment flips to 'paid' is a genuine webhook → SSE event. This is what
 *     lets the browser test prove the auto-success screen came from the SSE
 *     bus, not from the mock's timer or the 3s polling fallback.
 *   - CUTLUY_WEBHOOK_SECRET set so the test can POST a correctly-signed
 *     /webhooks/cutluy payload (the exact production path).
 *   - a throwaway Mongo DB (derived from MONGODB_URI, dropped on exit).
 *
 * Usage: npm run start:browser-test   (tsx scripts/start-browser-test.ts)
 * Port:  4001 — must match frontend/playwright.config.ts webServer URL.
 */
// Force the mock providers BEFORE any app module is imported (the payment
// factory and SMM factory capture their singletons at import time).
process.env.PAYMENT_PROVIDER = 'mock'
process.env.SMM_PROVIDER = 'mock'
// NODE_ENV must be non-production so the test-only dev routes mount.
process.env.NODE_ENV = 'test'
process.env.PORT = '4001'
// Freeze the mock at 'pending' forever — only a webhook can settle it.
process.env.MOCK_PAYMENT_SCANNED_MS = '999999999'
process.env.MOCK_PAYMENT_PAID_MS = '999999999'
// Webhook signing secret the test uses to forge a valid CutLuy delivery.
process.env.CUTLUY_WEBHOOK_SECRET = 'browser-test-webhook-secret-0123456789'
// Fake hosted-checkout URL so the payment page renders the checkout-fallback
// branch (bank chips that lack a deep link open this via window.open).
process.env.MOCK_CHECKOUT_URL = 'https://checkout.cutluy.test/pay/demo'
// The browser test is one user — never let the rate limiter interfere.
process.env.RATE_LIMIT_MAX = '100000'
process.env.RATE_LIMIT_WINDOW_MS = '600000'

const DB_NAME = `vidsmm_browsertest_${Date.now()}`

/** Rewrites MONGODB_URI to point at a throwaway database. */
function throwawayUri(): string {
  const u = new URL(process.env.MONGODB_URI ?? '')
  u.pathname = `/${DB_NAME}`
  return u.toString()
}

async function main(): Promise<void> {
  await import('dotenv/config')
  process.env.MONGODB_URI = throwawayUri()

  const mongoose = (await import('mongoose')).default
  const { createApp } = await import('../src/app.js')
  const { connectDatabase } = await import('../src/config/database.js')

  await connectDatabase()
  console.log(`[browser-test] connected to throwaway db: ${DB_NAME}`)

  const app = createApp()
  const server = app.listen(4001, () => {
    console.log('[browser-test] backend listening on http://localhost:4001 (mock provider, webhook secret set)')
  })

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[browser-test] ${signal} — closing, dropping throwaway db`)
    server.close()
    try {
      await mongoose.connection.db?.dropDatabase()
    } catch {
      /* best-effort cleanup */
    }
    await mongoose.disconnect()
    process.exit(0)
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

main().catch((err) => {
  console.error('[browser-test] failed to boot:', err instanceof Error ? err.message : err)
  process.exit(1)
})
