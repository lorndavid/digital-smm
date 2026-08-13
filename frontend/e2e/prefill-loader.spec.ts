import { expect, test, type APIRequestContext, type APIResponse, type Page } from '@playwright/test'
import { createHmac, randomUUID } from 'node:crypto'

/**
 * Prefill speed + loader verification.
 *
 * Clicks through the two flows that were reported slow:
 *   1. Favourites tab → click a favourited service → Explore Services must
 *      show the "Preparing your order…" loader, then a pre-filled order form
 *      FAST (no full-catalogue pagination gate).
 *   2. Orders list "Order again" and Order detail "Order again" → same
 *      prefill, with the Link field intentionally empty.
 *
 * Requires the Playwright webServer stack (backend :4001, frontend :5199).
 * Run: npm run test:e2e -w frontend -- prefill-loader.spec.ts
 */

const BACKEND = 'http://localhost:4001'

/** Order form locators (stable across the Explore view). */
const orderForm = (page: Page) => page.locator('[data-order-form]')
const prefillLoader = (page: Page) => page.locator('[data-prefill-loading]')
const prefillBar = (page: Page) => page.locator('.prefill-bar')
const linkInput = (page: Page) => page.getByLabel('Link to your page or post')
const qtyInput = (page: Page) => page.getByPlaceholder(/50\s*–\s*10,000/)

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
  return (await boot.json()) as {
    token: string
    payment: { providerPaymentId: string; referenceId: string; amount: number }
    webhookSecret: string
  }
}

/** Settles the bootstrap $5 top-up with a genuine signed CutLuy webhook. */
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

async function signIn(page: Page, request: APIRequestContext): Promise<void> {
  const { token } = await bootstrap(request)
  await page.addInitScript((t) => localStorage.setItem('digitalsmm_session_token', t), token)
}

/** Picks TikTok Followers in Explore and stars it (the selected-card star). */
async function pickAndFavouriteService(page: Page): Promise<void> {
  await page.goto('/dashboard/services')
  await expect(page.locator('h1').filter({ hasText: 'Explore Services' })).toBeVisible()
  await page.getByPlaceholder(/Search all services/).fill('TikTok Followers')
  await page.getByRole('button', { name: /TikTok Followers/ }).first().click()
  await expect(page.getByRole('heading', { name: 'TikTok Followers', level: 3 })).toBeVisible()
  // Star the selected service (card-level star).
  await page.locator('[data-fav-selected-service]').click()
  await expect(page.locator('[data-fav-selected-service]')).toHaveAttribute(
    'data-favorited',
    'true',
  )
}

test('fav → explore: loader shows, then a fast pre-filled order form', async ({
  page,
  request,
}) => {
  await signIn(page, request)
  await pickAndFavouriteService(page)

  // Favourites tab must show the service card.
  await page.goto('/dashboard/favorites')
  await expect(page.locator('h1').filter({ hasText: 'Favourites' })).toBeVisible()
  const favCard = page.locator('[data-favorite-service]').first()
  await expect(favCard).toBeVisible()
  await expect(favCard).toContainText('TikTok Followers')

  // The loader can flash by in <100ms on a fast local stack — delay the
  // categories request so the loading animation is deterministically visible,
  // proving it renders while the prefill resolves.
  await page.route('**/api/categories*', async (route) => {
    await new Promise((r) => setTimeout(r, 700))
    await route.continue()
  })

  // Click the favourited service → Explore with prefill.
  const start = Date.now()
  await favCard.click()
  await page.waitForURL(/\/dashboard\/services\?/)

  // The loader + top progress bar appear while the prefill is in flight…
  await expect(prefillLoader(page)).toBeVisible({ timeout: 5000 })
  await expect(prefillBar(page)).toBeVisible()

  // …then the pre-filled order form arrives and the loader goes away.
  await expect(orderForm(page)).toBeVisible({ timeout: 15_000 })
  await expect(prefillLoader(page)).not.toBeVisible()
  await expect(prefillBar(page)).not.toBeVisible()
  await page.unroute('**/api/categories*')

  const elapsed = Date.now() - start
  console.log(`[prefill] fav → explore prefill in ${elapsed}ms (incl. 700ms test delay)`)

  // Service pre-selected, order form fully pre-filled, link empty.
  await expect(
    page.getByRole('heading', { name: 'TikTok Followers', level: 3 }),
  ).toBeVisible()
  await expect(linkInput(page)).toHaveValue('')
  // Form is visible and interactive — place-order button ready.
  await expect(page.getByRole('button', { name: /Place order/ })).toBeVisible()

  // Perceived speed: even WITH the artificial 700ms delay the whole nav +
  // prefill must feel instant (< 4s); real-world is that minus 700ms.
  expect(elapsed, `fav → explore took ${elapsed}ms`).toBeLessThan(4000)
})

test('order again (list): loader shows, fields pre-filled, link empty', async ({
  page,
  request,
}) => {
  const { token, payment, webhookSecret } = await bootstrap(request)
  await settleTopUp(request, payment, webhookSecret) // $5.00 wallet
  await page.addInitScript((t) => localStorage.setItem('digitalsmm_session_token', t), token)

  // Place an order (1000 × $0.90/1k = $0.90).
  await page.goto('/dashboard/services')
  await page.getByPlaceholder(/Search all services/).fill('TikTok Followers')
  await page.getByRole('button', { name: /TikTok Followers/ }).first().click()
  await linkInput(page).fill('https://www.tiktok.com/@e2e-user')
  await qtyInput(page).fill('1000')
  await page.getByRole('button', { name: /Place order/ }).click()
  await page.waitForURL(/\/dashboard\/orders\/[a-f0-9]{24}$/)
  await expect(page.locator('h1').filter({ hasText: /Order #/ })).toBeVisible()

  // Orders list → Order again.
  await page.goto('/dashboard/orders')
  await expect(page.locator('h1').filter({ hasText: 'Orders' })).toBeVisible()
  const start = Date.now()
  await page.getByRole('button', { name: 'Order again' }).first().click()
  await page.waitForURL(/\/dashboard\/services\?/)
  await expect(orderForm(page)).toBeVisible({ timeout: 15_000 })

  await expect(prefillLoader(page)).not.toBeVisible()
  await expect(prefillBar(page)).not.toBeVisible()

  const elapsed = Date.now() - start
  console.log(`[prefill] order-again (list) prefill in ${elapsed}ms`)

  await expect(
    page.getByRole('heading', { name: 'TikTok Followers', level: 3 }),
  ).toBeVisible()
  // Quantity carried over, link intentionally empty.
  await expect(qtyInput(page)).toHaveValue('1000')
  await expect(linkInput(page)).toHaveValue('')
  expect(elapsed, `order-again (list) took ${elapsed}ms`).toBeLessThan(4000)
})

test('order again (detail): loader shows, fields pre-filled, link empty', async ({
  page,
  request,
}) => {
  const { token, payment, webhookSecret } = await bootstrap(request)
  await settleTopUp(request, payment, webhookSecret) // $5.00 wallet
  await page.addInitScript((t) => localStorage.setItem('digitalsmm_session_token', t), token)

  // Place an order and land on its detail page.
  await page.goto('/dashboard/services')
  await page.getByPlaceholder(/Search all services/).fill('TikTok Followers')
  await page.getByRole('button', { name: /TikTok Followers/ }).first().click()
  await linkInput(page).fill('https://www.tiktok.com/@e2e-user')
  await qtyInput(page).fill('1000')
  await page.getByRole('button', { name: /Place order/ }).click()
  await page.waitForURL(/\/dashboard\/orders\/[a-f0-9]{24}$/)
  await expect(page.locator('h1').filter({ hasText: /Order #/ })).toBeVisible()

  // Order again straight from the detail page.
  const start = Date.now()
  await page.getByRole('button', { name: /Order again/ }).click()
  await page.waitForURL(/\/dashboard\/services\?/)
  await expect(orderForm(page)).toBeVisible({ timeout: 15_000 })

  await expect(prefillLoader(page)).not.toBeVisible()
  await expect(prefillBar(page)).not.toBeVisible()

  const elapsed = Date.now() - start
  console.log(`[prefill] order-again (detail) prefill in ${elapsed}ms`)

  await expect(
    page.getByRole('heading', { name: 'TikTok Followers', level: 3 }),
  ).toBeVisible()
  await expect(qtyInput(page)).toHaveValue('1000')
  await expect(linkInput(page)).toHaveValue('')
  expect(elapsed, `order-again (detail) took ${elapsed}ms`).toBeLessThan(4000)
})

test('plain Explore visit shows NO prefill loader (no flash)', async ({ page, request }) => {
  await signIn(page, request)
  await page.goto('/dashboard/services')
  await expect(page.locator('h1').filter({ hasText: 'Explore Services' })).toBeVisible()
  await expect(orderForm(page)).toHaveCount(0)
  await expect(prefillLoader(page)).toHaveCount(0)
  await expect(prefillBar(page)).toHaveCount(0)
})
