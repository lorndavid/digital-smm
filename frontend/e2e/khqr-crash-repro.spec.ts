import { createHmac, randomUUID } from 'node:crypto'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

/**
 * Crash-reproduction stress spec for the KHQR payment modal.
 *
 * The user hit `instance.update is not a function` (Vue runtime crash inside
 * updateComponent → patchKeyedChildren) while using the top-up flow. This
 * spec hammers the race conditions around the modal (rapid open/close,
 * auto-close vs reopen, double-submit, loading toggles) and FAILS if any
 * pageerror / console error appears.
 *
 * Run: npx playwright test --config=playwright.config.ts khqr-crash-repro.spec.ts
 */

const BACKEND = 'http://localhost:4001'

async function ok(res: Awaited<ReturnType<APIRequestContext['post']>>, what: string): Promise<void> {
  if (!res.ok()) throw new Error(`${what} failed: ${res.status()} ${await res.text().catch(() => '')}`)
}

async function boot(request: APIRequestContext): Promise<{ token: string; webhookSecret: string }> {
  const res = await request.post(`${BACKEND}/api/dev/test-bootstrap`)
  await ok(res, 'test-bootstrap')
  const { token, webhookSecret } = (await res.json()) as { token: string; webhookSecret: string }
  expect(token).toBeTruthy()
  return { token, webhookSecret }
}

async function signIn(page: Page, token: string): Promise<void> {
  await page.addInitScript((t) => localStorage.setItem('digitalsmm_session_token', t), token)
  await page.goto('/dashboard/wallet')
  await expect(page.getByRole('button', { name: /Top up/ })).toBeVisible()
}

function watchErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (err) => {
    errors.push(`PAGEERROR: ${err.message}\n${err.stack ?? ''}`)
  })
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`CONSOLE: ${msg.text()}`)
  })
  page.on('response', (res) => {
    if (res.status() >= 400) errors.push(`HTTP ${res.status()}: ${res.url()}`)
  })
  return errors
}

async function openModal(page: Page, amount = '$10'): Promise<void> {
  await page.getByRole('button', { name: /Top up/ }).click()
  await expect(page.getByText('Top up wallet').first()).toBeVisible()
  await page.getByRole('button', { name: amount, exact: true }).click()
  await page.getByRole('button', { name: /Continue to payment/ }).click()
  await expect(page.locator('img[alt="KHQR"]')).toBeVisible({ timeout: 15_000 })
}

async function fireWebhook(
  request: APIRequestContext,
  webhookSecret: string,
  ref: string,
  providerPaymentId: string,
  amount: number,
): Promise<void> {
  const t = Math.floor(Date.now() / 1000)
  const body = JSON.stringify({
    id: `evt-${randomUUID()}`,
    type: 'payment.completed',
    created: new Date().toISOString(),
    data: {
      payment: {
        id: providerPaymentId,
        status: 'paid',
        amount: String(amount),
        currency: 'USD',
        reference_id: ref,
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
}

test('stress 1: rapid open → X-close → reopen cycles never crash', async ({ page, request }) => {
  const { token } = await boot(request)
  const errors = watchErrors(page)
  await signIn(page, token)

  for (let i = 0; i < 4; i++) {
    await openModal(page)
    // Close via the modal X immediately (leave animation mid-flight).
    await page.locator('.aba-close-button').click()
    await expect(page.locator('img[alt="KHQR"]')).toBeHidden({ timeout: 10_000 })
    // Reopen right away.
    await openModal(page)
    await page.locator('.aba-close-button').click()
    await expect(page.locator('img[alt="KHQR"]')).toBeHidden({ timeout: 10_000 })
  }

  expect(errors, `render errors during rapid open/close:\n${errors.join('\n')}`).toEqual([])
})

test('stress 2: success auto-close racing an immediate reopen never crashes', async ({
  page,
  request,
}) => {
  const { token, webhookSecret } = await boot(request)
  const errors = watchErrors(page)
  await signIn(page, token)

  let created: { referenceId: string; providerPaymentId: string; amount: number } | null = null
  await page.route('**/api/payment/create*', async (route) => {
    const response = await route.fetch()
    const json = (await response.json()) as {
      payment: { referenceId: string; providerPaymentId: string; amount: number }
    }
    created = json.payment
    await route.fulfill({ response })
  })

  // Payment 1: open, pay, success, auto-close.
  await openModal(page)
  await expect.poll(() => created, { timeout: 10_000 }).toBeTruthy()
  await fireWebhook(request, webhookSecret, created!.referenceId, created!.providerPaymentId, created!.amount)
  await expect(page.getByText('Payment Successful 🎉')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('img[alt="KHQR"]')).toBeHidden({ timeout: 15_000 })

  // Payment 2: reopen IMMEDIATELY after auto-close, pay again, auto-close.
  created = null
  await openModal(page)
  await expect.poll(() => created, { timeout: 10_000 }).toBeTruthy()
  await fireWebhook(request, webhookSecret, created!.referenceId, created!.providerPaymentId, created!.amount)
  await expect(page.getByText('Payment Successful 🎉')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('img[alt="KHQR"]')).toBeHidden({ timeout: 15_000 })

  // Payment 3: reopen once more to prove the instance is healthy.
  await openModal(page)
  await expect(page.locator('img[alt="KHQR"]')).toBeVisible()

  expect(errors, `render errors during auto-close/reopen:\n${errors.join('\n')}`).toEqual([])
})

test('stress 3: close during success countdown, then reopen, never crashes', async ({
  page,
  request,
}) => {
  const { token, webhookSecret } = await boot(request)
  const errors = watchErrors(page)
  await signIn(page, token)

  let created: { referenceId: string; providerPaymentId: string; amount: number } | null = null
  await page.route('**/api/payment/create*', async (route) => {
    const response = await route.fetch()
    const json = (await response.json()) as {
      payment: { referenceId: string; providerPaymentId: string; amount: number }
    }
    created = json.payment
    await route.fulfill({ response })
  })

  await openModal(page)
  await expect.poll(() => created, { timeout: 10_000 }).toBeTruthy()
  await fireWebhook(request, webhookSecret, created!.referenceId, created!.providerPaymentId, created!.amount)
  await expect(page.getByText('Payment Successful 🎉')).toBeVisible({ timeout: 15_000 })
  // Close MANUALLY during the 4s auto-close countdown.
  await page.waitForTimeout(800)
  await page.locator('.aba-close-button').click({ force: true }).catch(() => undefined)
  await expect(page.locator('img[alt="KHQR"]')).toBeHidden({ timeout: 10_000 })

  // Reopen immediately.
  await openModal(page)
  await expect(page.locator('img[alt="KHQR"]')).toBeVisible()

  expect(errors, `render errors during countdown close:\n${errors.join('\n')}`).toEqual([])
})

test('stress 4: wallet loading toggles while the modal is open never crash', async ({
  page,
  request,
}) => {
  const { token } = await boot(request)
  const errors = watchErrors(page)
  await signIn(page, token)

  // Slow the wallet fetch so `store.loading` flips true → false repeatedly
  // WHILE the KHQR modal is open (WalletView re-renders its keyed skeleton
  // list on every flip).
  await page.route('**/api/wallet*', async (route) => {
    await new Promise((r) => setTimeout(r, 600))
    await route.continue()
  })

  await openModal(page)

  // Flip loading a few times by toggling the top-up modal open/closed (each
  // close triggers onKhqrClose → refreshWallet).
  for (let i = 0; i < 3; i++) {
    await page.locator('.aba-close-button').click()
    await page.waitForTimeout(150)
    await page.getByRole('button', { name: /Top up/ }).click()
    await page.getByRole('button', { name: '$10', exact: true }).click()
    await page.getByRole('button', { name: /Continue to payment/ }).click()
    await expect(page.locator('img[alt="KHQR"]')).toBeVisible({ timeout: 15_000 })
  }

  expect(errors, `render errors during loading toggles:\n${errors.join('\n')}`).toEqual([])
})
