import { createHmac, randomUUID } from 'node:crypto'
import { expect, test, type APIResponse } from '@playwright/test'

/**
 * Browser test — KHQR payment auto-success via the SSE bus.
 *
 * Proves, end-to-end in a real browser against the REAL backend:
 *   1. A real KHQR (PNG data URL from the mock provider) renders on /pay/:ref.
 *   2. A genuine, correctly-signed CutLuy webhook (payment.completed) flips
 *      the payment to 'paid' through the production webhook → SSE path.
 *   3. The success screen appears WITHOUT a refresh and WITHOUT the polling
 *      safety net — i.e. it can only have arrived over the SSE stream.
 *
 * How SSE (not polling) is proven:
 *   - The mock provider is FROZEN at 'pending' in the test backend, so only
 *     the webhook can settle the payment.
 *   - After the initial load, every `/api/payment/status` request is aborted
 *     via page.route(), killing the 3s polling fallback. The success screen
 *     can therefore ONLY appear via the SSE events stream.
 *   - `loads === 1` asserts no full page reload ever happened.
 *
 * Requires the Playwright webServer stack from frontend/playwright.config.ts
 * (backend on :4001, frontend on :5199). Run: npm run test:e2e -w frontend
 */

const BACKEND = 'http://localhost:4001'

/** Builds a signed CutLuy `payment.completed` webhook for a reference. */
function signedCompletedWebhook(
  payment: { providerPaymentId: string; referenceId: string; amount: number },
  secret: string,
): { headers: Record<string, string>; body: string } {
  const t = Math.floor(Date.now() / 1000)
  const body = JSON.stringify({
    id: `evt-${randomUUID()}`,
    type: 'payment.completed',
    created: new Date().toISOString(),
    data: {
      payment: {
        id: payment.providerPaymentId,
        status: 'paid',
        amount: String(payment.amount),
        currency: 'USD',
        reference_id: payment.referenceId,
        metadata: null,
        approved_at: new Date().toISOString(),
      },
    },
  })
  const v1 = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')
  return {
    headers: {
      'content-type': 'application/json',
      'x-cutluy-event': 'payment.completed',
      'x-cutluy-signature': `t=${t},v1=${v1}`,
    },
    body,
  }
}

async function ok(res: APIResponse, what: string): Promise<void> {
  if (!res.ok()) {
    throw new Error(`${what} failed: ${res.status()} ${await res.text().catch(() => '')}`)
  }
}

test('KHQR payment page auto-shows success on SSE paid event (no refresh, no polling)', async ({
  page,
  request,
}) => {
  // ---------------------------------------------------------------------
  // 1. Bootstrap: throwaway customer + session token + real KHQR top-up.
  // ---------------------------------------------------------------------
  const boot = await request.post(`${BACKEND}/api/dev/test-bootstrap`)
  await ok(boot, 'test-bootstrap')
  const { token, payment, webhookSecret } = (await boot.json()) as {
    token: string
    payment: {
      referenceId: string
      providerPaymentId: string
      amount: number
      qrCodeDataUrl: string
    }
    webhookSecret: string
  }
  expect(token).toBeTruthy()
  expect(webhookSecret).toBeTruthy()
  expect(payment.referenceId).toMatch(/^PAY-/)
  expect(payment.qrCodeDataUrl).toMatch(/^data:image\/png/)

  // ---------------------------------------------------------------------
  // 2. Inject the session BEFORE the SPA boots, then count page loads.
  //    A refresh would fire another 'load' — we assert exactly one.
  // ---------------------------------------------------------------------
  let loads = 0
  page.on('load', () => {
    loads += 1
  })
  await page.addInitScript((t) => localStorage.setItem('vidsmm_session_token', t), token)

  // ---------------------------------------------------------------------
  // 3. Open the payment page and wait for the REAL KHQR image.
  // ---------------------------------------------------------------------
  await page.goto(`/pay/${payment.referenceId}`)

  const qr = page.locator('img[alt="Bakong KHQR payment code"]')
  await expect(qr).toBeVisible()
  expect(await qr.getAttribute('src')).toMatch(/^data:image\/png/)
  await expect(page.getByText('Waiting for payment')).toBeVisible()
  await expect(page.getByText('Secure checkout · Bakong KHQR')).toBeVisible()
  // The pulsing "Live" indicator tells the customer the page is watching.
  await expect(page.getByText('Live', { exact: true })).toBeVisible()

  // ---------------------------------------------------------------------
  // 4. Kill the polling safety net. From here on the ONLY way the page can
  //    learn the payment is paid is the SSE events stream.
  // ---------------------------------------------------------------------
  await page.route('**/api/payment/status*', (route) => route.abort())

  // ---------------------------------------------------------------------
  // 5. Fire the genuine signed CutLuy webhook (the exact production path:
  //    signature verify → fulfill → emitPaymentStatus('paid') → SSE).
  // ---------------------------------------------------------------------
  const wh = signedCompletedWebhook(payment, webhookSecret)
  const res = await request.post(`${BACKEND}/webhooks/cutluy`, {
    headers: wh.headers,
    data: wh.body,
  })
  await ok(res, 'cutluy webhook')

  // ---------------------------------------------------------------------
  // 6. The success screen must appear automatically — via SSE, with no
  //    refresh and no polling.
  // ---------------------------------------------------------------------
  await expect(page.getByText('Wallet credited! 🎉')).toBeVisible()
  await expect(page.getByText(/added to your wallet/)).toBeVisible()

  // Still on the payment page (the 6s redirect to the wallet has not run).
  expect(page.url()).toContain(`/pay/${payment.referenceId}`)
  // Exactly one page load: the initial navigation. No refresh ever happened.
  expect(loads).toBe(1)
})

test('rejects a webhook with an invalid signature and does NOT fulfill (security)', async ({ request }) => {
  const boot = await request.post(`${BACKEND}/api/dev/test-bootstrap`)
  await ok(boot, 'test-bootstrap')
  const { payment, token } = (await boot.json()) as {
    token: string
    payment: { referenceId: string; providerPaymentId: string; amount: number }
  }

  const body = JSON.stringify({
    id: `evt-${randomUUID()}`,
    type: 'payment.completed',
    created: new Date().toISOString(),
    data: {
      payment: {
        id: payment.providerPaymentId,
        status: 'paid',
        amount: String(payment.amount),
        currency: 'USD',
        reference_id: payment.referenceId,
        metadata: null,
        approved_at: new Date().toISOString(),
      },
    },
  })
  // Deliberately WRONG signature.
  const res = await request.post(`${BACKEND}/webhooks/cutluy`, {
    headers: {
      'content-type': 'application/json',
      'x-cutluy-event': 'payment.completed',
      'x-cutluy-signature': `t=${Math.floor(Date.now() / 1000)},v1=${'0'.repeat(64)}`,
    },
    data: body,
  })
  expect(res.status()).toBe(400)

  // The forged webhook must NOT have settled the payment.
  const status = await request.get(
    `${BACKEND}/api/payment/status?reference=${encodeURIComponent(payment.referenceId)}`,
    { headers: { authorization: `Bearer ${token}` } },
  )
  await ok(status, 'payment status')
  const { payment: after } = (await status.json()) as { payment: { status: string } }
  expect(after.status).toBe('pending')
})
