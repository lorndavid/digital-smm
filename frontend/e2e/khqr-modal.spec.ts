import { createHmac, randomUUID } from 'node:crypto'
import { expect, test, type APIRequestContext, type APIResponse, type Page } from '@playwright/test'

/**
 * Centered KHQR payment modal — wallet top-up flow.
 *
 * Proves, end-to-end in a real browser against the real backend:
 *   1. Tapping "Top up" on the Wallet page opens the KHQR payment modal
 *      CENTERED over the wallet (no navigation to /pay/:ref anymore).
 *   2. The clean KHQR card renders (red KHQR header, QR image, live status,
 *      countdown).
 *   3. A genuine signed CutLuy webhook flips the payment to 'paid' through
 *      the production webhook → SSE path, and the modal auto-shows the
 *      success state — no refresh, no polling (mock frozen at pending).
 *   4. The wallet balance refreshes to include the topped-up amount.
 *   5. On a phone viewport the modal renders as a BOTTOM SHEET that pops up
 *      from the bottom edge (not a centered card).
 *
 * Requires the Playwright webServer stack (backend :4001, frontend :5199).
 * Run: npm run test:e2e -w frontend -- khqr-modal.spec.ts
 */

const BACKEND = 'http://localhost:4001'

async function ok(res: APIResponse, what: string): Promise<void> {
  if (!res.ok()) {
    throw new Error(`${what} failed: ${res.status()} ${await res.text().catch(() => '')}`)
  }
}

test('wallet top-up opens the centered KHQR modal and auto-verifies payment', async ({
  page,
  request,
}) => {
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
  expect(payment.referenceId).toMatch(/^PAY-/)

  // Sign in and open the wallet.
  await page.addInitScript((t) => localStorage.setItem('digitalsmm_session_token', t), token)
  await page.goto('/dashboard/wallet')
  await expect(page.locator('h1').filter({ hasText: 'Wallet' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Top up/ })).toBeVisible()

  // Capture the REAL top-up payment created when the modal opens, so the
  // webhook settles THIS payment (not the bootstrap one).
  let createdPayment: { referenceId: string; providerPaymentId: string; amount: number } | null =
    null
  await page.route('**/api/payment/create*', async (route) => {
    const response = await route.fetch()
    const json = (await response.json()) as {
      payment: { referenceId: string; providerPaymentId: string; amount: number }
    }
    createdPayment = json.payment
    await route.fulfill({ response })
  })

  // Open the top-up modal and pick a quick amount.
  await page.getByRole('button', { name: /Top up/ }).click()
  await expect(page.getByText('Top up wallet').first()).toBeVisible()
  await page.getByRole('button', { name: '$10', exact: true }).click()
  await page.getByRole('button', { name: /Continue to payment/ }).click()

  // The KHQR modal opens CENTERED over the wallet — still on /dashboard/wallet.
  await expect(page).toHaveURL(/\/dashboard\/wallet/)
  await expect(page.locator('img[alt="KHQR"]')).toBeVisible({ timeout: 15_000 })
  // Minimal KHQR card: red wordmark + merchant + USD amount render.
  await expect(page.getByText('KHQR', { exact: true })).toBeVisible()
  await expect(page.getByText('DigitalSMM')).toBeVisible()
  await expect(page.getByText('USD', { exact: true })).toBeVisible()
  // The route interceptor resolves asynchronously — wait for the captured
  // top-up payment before firing the webhook against it.
  await expect
    .poll(() => createdPayment, { timeout: 10_000 })
    .toBeTruthy()
  await expect(page.getByText('Waiting for payment')).toBeVisible()
  await expect(page.locator('.live-ring')).toBeVisible()

  // Kill the polling safety net — only SSE can deliver the paid event.
  await page.route('**/api/payment/status*', (route) => route.abort())

  // Fire a genuine signed webhook for THIS top-up payment → paid → SSE.
  const target = createdPayment!
  const t = Math.floor(Date.now() / 1000)
  const body = JSON.stringify({
    id: `evt-${randomUUID()}`,
    type: 'payment.completed',
    created: new Date().toISOString(),
    data: {
      payment: {
        id: target.providerPaymentId,
        status: 'paid',
        amount: String(target.amount),
        currency: 'USD',
        reference_id: target.referenceId,
        metadata: null,
        approved_at: new Date().toISOString(),
      },
    },
  })
  const v1 = createHmac('sha256', webhookSecret).update(`${t}.${body}`).digest('hex')
  const wh = await request.post(`${BACKEND}/webhooks/cutluy`, {
    headers: {
      'content-type': 'application/json',
      'x-cutluy-event': 'payment.completed',
      'x-cutluy-signature': `t=${t},v1=${v1}`,
    },
    data: body,
  })
  await ok(wh, 'cutluy webhook')

  // Success appears automatically inside the modal via SSE (no refresh).
  await expect(page.getByText('Payment Successful 🎉')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/has been added to your wallet/)).toBeVisible()

  // The modal auto-closes a few seconds after success.
  await expect(page.locator('img[alt="KHQR"]')).toBeHidden({ timeout: 15_000 })
  await expect(page.locator('h1').filter({ hasText: 'Wallet' })).toBeVisible()

  // The balance reflects the settled $10.00 top-up (the bootstrap $5 payment
  // was never paid — only the modal's $10 was settled via the webhook).
  // Scoped to the wallet's main balance paragraph: other elements (topbar
  // balance, stat cards, recent top-ups) may show the same amount.
  await expect(page.getByRole('paragraph').filter({ hasText: /^\$10\.00$/ })).toBeVisible({
    timeout: 15_000,
  })
})

test('phone viewport: KHQR modal pops up as a bottom sheet', async ({ page, request }) => {
  // Phone viewport.
  await page.setViewportSize({ width: 390, height: 844 })

  const boot = await request.post(`${BACKEND}/api/dev/test-bootstrap`)
  await ok(boot, 'test-bootstrap')
  const { token } = (await boot.json()) as { token: string }
  await page.addInitScript((t) => localStorage.setItem('digitalsmm_session_token', t), token)

  await page.goto('/dashboard/wallet')
  await expect(page.getByRole('button', { name: /Top up/ })).toBeVisible()
  await page.getByRole('button', { name: /Top up/ }).click()
  await page.getByRole('button', { name: '$10', exact: true }).click()
  await page.getByRole('button', { name: /Continue to payment/ }).click()

  // The KHQR modal renders — QR visible on the phone too.
  await expect(page.locator('img[alt="KHQR"]')).toBeVisible({ timeout: 15_000 })

  // Bottom sheet: the content's bottom edge sits at the viewport bottom and
  // its top is below the viewport top (it's a sheet, not a centered card).
  // Poll until the 0.35s slide-up animation settles.
  await expect
    .poll(async () => {
      const box = (await page.locator('.aba-checkout-content').boundingBox())!
      return Math.abs(box.y + box.height - 844)
    })
    .toBeLessThan(2)
  const box = (await page.locator('.aba-checkout-content').boundingBox())!
  expect(box.y).toBeGreaterThan(100)
})
