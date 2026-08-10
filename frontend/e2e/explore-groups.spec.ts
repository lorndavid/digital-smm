import { createHmac, randomUUID } from 'node:crypto'
import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test'

/**
 * Explore page — SMM-panel order flow.
 *
 * The storefront is now a real SMM-style order form:
 *   - a search box that searches ALL services,
 *   - a Category dropdown,
 *   - a searchable Service combobox,
 *   - a details panel (description, average time, quantity range, rate),
 *   - link + quantity + live charge,
 *   - ordering paid from the WALLET BALANCE (no QR) — with a clear
 *     "top up" prompt when the balance is not enough.
 *
 * The browser-test backend seeds the mock provider catalogue (16 services)
 * and test-bootstrap creates a fresh customer with an EMPTY wallet (the
 * $5 top-up stays pending until the test settles it via a signed webhook).
 *
 * Requires the Playwright webServer stack (backend :4001, frontend :5199).
 * Run: npm run test:e2e -w frontend
 */

const BACKEND = 'http://localhost:4001'

async function ok(res: APIResponse, what: string): Promise<void> {
  if (!res.ok()) {
    throw new Error(`${what} failed: ${res.status()} ${await res.text().catch(() => '')}`)
  }
}

async function bootstrap(request: APIRequestContext): Promise<{
  token: string
  payment: { providerPaymentId: string; referenceId: string; amount: number }
  webhookSecret: string
}> {
  const boot = await request.post(`${BACKEND}/api/dev/test-bootstrap`)
  await ok(boot, 'test-bootstrap')
  const body = (await boot.json()) as {
    token: string
    payment: { providerPaymentId: string; referenceId: string; amount: number }
    webhookSecret: string
  }
  expect(body.token).toBeTruthy()
  return body
}

/** Settles the bootstrap top-up with a genuine signed CutLuy webhook. */
async function settleTopUp(
  request: APIRequestContext,
  payment: { providerPaymentId: string; referenceId: string; amount: number },
  secret: string,
): Promise<void> {
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
  const res = await request.post(`${BACKEND}/webhooks/cutluy`, {
    headers: {
      'content-type': 'application/json',
      'x-cutluy-event': 'payment.completed',
      'x-cutluy-signature': `t=${t},v1=${v1}`,
    },
    data: body,
  })
  await ok(res, 'cutluy webhook')
}

async function pickService(page: import('@playwright/test').Page, name: string): Promise<void> {
  const searchBox = page.getByPlaceholder('Search all services…')
  const searchText = await searchBox.inputValue().catch(() => '')
  if (searchText.trim()) {
    // Typing opened the LIVE search dropdown — pick the result there
    // (one click auto-selects the service AND its category).
    await page.getByRole('button', { name: new RegExp(name) }).click()
    return
  }
  // No search text: open the searchable Service combobox and pick the row.
  await page.getByRole('button', { name: /Search or select a service/ }).click()
  await page.getByRole('button', { name: new RegExp(name) }).click()
}

test.beforeEach(async ({ page, request }) => {
  const { token } = await bootstrap(request)
  await page.addInitScript((t) => localStorage.setItem('vidsmm_session_token', t), token)
  await page.goto('/dashboard/services')
  await expect(page.getByRole('heading', { name: 'Explore Services' })).toBeVisible()
})

test('search-all finds a service; selecting it shows details and the order form', async ({
  page,
}) => {
  // No-markup promise is visible on the page.
  await expect(page.getByText(/no markup/i)).toBeVisible()

  // The search box searches the WHOLE catalogue (not a per-category grid)
  // and shows a LIVE dropdown of matching services as you type.
  await page.getByPlaceholder('Search all services…').fill('Facebook Page Likes')
  await expect(page.getByText(/1 result/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Facebook Page Likes/ })).toBeVisible()

  // Clicking a result in the search dropdown picks it for ordering AND
  // auto-sets the Category dropdown to the service's category.
  await page.getByRole('button', { name: /Facebook Page Likes/ }).click()

  // Details panel: name, average time, quantity range, rate.
  await expect(page.getByRole('heading', { name: 'Facebook Page Likes', level: 3 })).toBeVisible()
  await expect(page.getByText('Average time')).toBeVisible()
  await expect(page.getByText('Quantity range')).toBeVisible()
  await expect(page.getByText('$1.10 / 1,000', { exact: true })).toBeVisible()

  // Category dropdown auto-set to the service's category.
  await expect(page.getByLabel('Category').locator('option:checked')).toHaveText('Facebook')

  // Order form renders: link + quantity + charge.
  await expect(page.getByLabel('Link to your page or post')).toBeVisible()
  await expect(page.locator('input[type="number"]')).toBeVisible()
  await expect(page.getByText('Charge')).toBeVisible()
  await expect(page.getByRole('button', { name: /Place order/ })).toBeVisible()
})

test('keyboard: arrow down + Enter picks the highlighted search result', async ({ page }) => {
  await page.getByPlaceholder('Search all services…').fill('Facebook Page Likes')
  await expect(page.getByRole('button', { name: /Facebook Page Likes/ })).toBeVisible()

  // Arrow down highlights the first result; Enter auto-picks it.
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')

  await expect(page.getByRole('heading', { name: 'Facebook Page Likes', level: 3 })).toBeVisible()
  await expect(page.getByLabel('Category').locator('option:checked')).toHaveText('Facebook')
})

test('category dropdown filters the service list', async ({ page }) => {
  // Pick the Facebook category from the dropdown.
  await page.getByLabel('Category').selectOption({ label: 'Facebook' })

  // The combobox now lists only Facebook services.
  await page.getByRole('button', { name: /Search or select a service/ }).click()
  await expect(page.getByRole('button', { name: /Facebook Page Likes/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /TikTok Followers/ })).toHaveCount(0)
})

test('orders are paid from the wallet; empty balance prompts a top-up', async ({ page }) => {
  // Fresh bootstrap user has a $0.00 wallet.
  await expect(page.getByText('$0.00').first()).toBeVisible()

  // Pick a service and configure an order that costs more than $0.
  await page.getByPlaceholder('Search all services…').fill('TikTok Followers')
  await pickService(page, 'TikTok Followers')

  await page.getByLabel('Link to your page or post').fill('https://www.tiktok.com/@e2e-user')
  await page.getByPlaceholder(/50\s*–\s*10,000/).fill('10000') // 10,000 × $0.90/1k = $9.00

  // Charge updates live and exceeds the $0 balance → top-up prompt appears.
  await expect(page.getByText('Not enough balance for this order')).toBeVisible()
  const topUp = page.getByRole('button', { name: /Top up wallet/ })
  await expect(topUp).toBeVisible()
})

test('happy path: funded wallet places the order and redirects to it', async ({
  page,
  request,
}) => {
  // Bootstrap a dedicated user, credit THEIR wallet by settling the $5
  // top-up via a signed webhook, then sign in as that same user.
  const { token, payment, webhookSecret } = await bootstrap(request)
  await settleTopUp(request, payment, webhookSecret)
  await page.addInitScript((t) => localStorage.setItem('vidsmm_session_token', t), token)

  await page.goto('/dashboard/services')
  await expect(page.getByText('$5.00').first()).toBeVisible()

  await page.getByPlaceholder('Search all services…').fill('TikTok Followers')
  await pickService(page, 'TikTok Followers')

  await page.getByLabel('Link to your page or post').fill('https://www.tiktok.com/@e2e-user')
  await page.getByPlaceholder(/50\s*–\s*10,000/).fill('1000') // 1000 × $0.90/1k = $0.90 ≤ $5.00

  await page.getByRole('button', { name: /Place order/ }).click()

  // Redirected to the new order's detail page.
  await page.waitForURL(/\/dashboard\/orders\/[a-f0-9]{24}$/)
})
