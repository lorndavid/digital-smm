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
  const searchBox = page.getByPlaceholder(/Search all services/)
  const searchText = await searchBox.inputValue().catch(() => '')
  if (searchText.trim()) {
    // Typing opened the LIVE search dropdown — pick the result there
    // (one click auto-selects the service AND its category).
    await page.getByRole('button', { name: new RegExp(name) }).click()
    return
  }
  // No search text: open the read-only Service field (grouped catalogue)
  // and pick the row.
  await page.getByPlaceholder(/Select a service/).click()
  await page.getByRole('button', { name: new RegExp(name) }).click()
}

test.beforeEach(async ({ page, request }) => {
  const { token } = await bootstrap(request)
  await page.addInitScript((t) => localStorage.setItem('digitalsmm_session_token', t), token)
  await page.goto('/dashboard/services')
  await expect(page.getByRole('heading', { name: 'Explore Services' })).toBeVisible()
})

test('search-all finds a service; selecting it shows details and the order form', async ({
  page,
}) => {
  // The search box searches the WHOLE catalogue (not a per-category grid)
  // and shows a LIVE dropdown of matching services as you type.
  await page.getByPlaceholder(/Search all services/).fill('Facebook Page Likes')
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

  // Category combobox auto-set to the service's category.
  await expect(page.getByPlaceholder(/Search or select a category/)).toHaveValue('Facebook')

  // Order form renders: link + quantity + charge.
  await expect(page.getByLabel('Link to your page or post')).toBeVisible()
  await expect(page.locator('input[type="number"]')).toBeVisible()
  await expect(page.getByText('Charge')).toBeVisible()
  await expect(page.getByRole('button', { name: /Place order/ })).toBeVisible()
})

test('live search shows a flat services-only list with no platform icons', async ({
  page,
}) => {
  // Typing "facebook" lists the matching SERVICES as a clean flat list — no
  // category rows, no platform icons.
  await page.getByPlaceholder(/Search all services/).fill('facebook')
  await expect(page.locator('[data-search-category]')).toHaveCount(0)
  await expect(page.locator('[data-search-service]').first()).toBeVisible()
  await expect(page.locator('[data-search-service]')).toHaveCount(3) // FB Likes/Post/Video

  // Clicking a service still auto-picks it AND its category.
  await page.locator('[data-search-service]').filter({ hasText: 'Facebook Page Likes' }).click()
  await expect(page.getByRole('heading', { name: 'Facebook Page Likes', level: 3 })).toBeVisible()
  await expect(page.getByPlaceholder(/Search or select a category/)).toHaveValue('Facebook')
})

test('multi-word search: every word must match (AND across name + category)', async ({
  page,
}) => {
  // "facebook post" → term 'facebook' matches the category, 'post' matches
  // the name — only Facebook Post Likes survives.
  await page.getByPlaceholder(/Search all services/).fill('facebook post')
  await expect(page.getByRole('button', { name: /Facebook Post Likes/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Facebook Page Likes/ })).toHaveCount(0)

  // Clicking the result still auto-picks the service and its category.
  await page.getByRole('button', { name: /Facebook Post Likes/ }).click()
  await expect(page.getByRole('heading', { name: 'Facebook Post Likes', level: 3 })).toBeVisible()
  await expect(page.getByPlaceholder(/Search or select a category/)).toHaveValue('Facebook')
})

test('multi-word search matches across service name and category words', async ({
  page,
}) => {
  // "tiktok views" → the name 'TikTok Views (High Retention)' matches both
  // words; plain 'TikTok Followers' fails the 'views' term.
  await page.getByPlaceholder(/Search all services/).fill('tiktok views')
  await expect(
    page.getByRole('button', { name: /TikTok Views \(High Retention\)/ }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: /TikTok Followers/ })).toHaveCount(0)
})

test('chevron buttons toggle their dropdowns open and closed', async ({ page }) => {
  // Category chevron opens the category list…
  const catChevron = page.getByRole('button', { name: 'Toggle category list' })
  await catChevron.click()
  await expect(page.locator('[data-category-option]').first()).toBeVisible()
  // …and clicking it again hides the dropdown.
  await catChevron.click()
  await expect(page.locator('[data-category-option]')).toHaveCount(0)

  // Service chevron opens the grouped service catalogue…
  const svcChevron = page.getByRole('button', { name: 'Toggle service list' })
  await svcChevron.click()
  await expect(page.locator('[data-service-row]').first()).toBeVisible()
  // …and clicking it again hides it.
  await svcChevron.click()
  await expect(page.locator('[data-service-row]')).toHaveCount(0)
})

test('keyboard: arrow down + Enter picks the highlighted search result', async ({ page }) => {
  await page.getByPlaceholder(/Search all services/).fill('Facebook Page Likes')
  await expect(page.getByRole('button', { name: /Facebook Page Likes/ })).toBeVisible()

  // Arrow down highlights the first result; Enter auto-picks it.
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')

  await expect(page.getByRole('heading', { name: 'Facebook Page Likes', level: 3 })).toBeVisible()
  await expect(page.getByPlaceholder(/Search or select a category/)).toHaveValue('Facebook')
})

test('service field: click opens the grouped catalogue; Enter picks the highlight', async ({
  page,
}) => {
  const field = page.getByPlaceholder(/Select a service/)

  // Real user flow: click the read-only field — the WHOLE grouped catalogue
  // opens instantly (no typing search here; search lives in the box above
  // and in the Category combobox).
  await field.click()
  await expect(page.getByRole('button', { name: /Facebook Page Likes/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /TikTok Followers/ })).toBeVisible()

  // Arrow down highlights the first row; Enter picks it and fills the field.
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-order-form]')).toBeVisible()
  await expect(field).not.toHaveValue('')
})

test('platform chips filter the catalogue; the open combobox still shows everything', async ({
  page,
}) => {
  // Header shows platform chips (replacing the wallet balance card).
  const facebookChip = page.locator('[data-platform-chip="facebook"]')
  await expect(facebookChip).toBeVisible()

  // Click Facebook → chip active; Facebook services lead the dropdown…
  await facebookChip.click()
  await expect(facebookChip).toHaveAttribute('aria-pressed', 'true')

  await page.getByPlaceholder(/Select a service/).click()
  await expect(page.getByRole('button', { name: /Facebook Page Likes/ })).toBeVisible()
  // …but opening the dropdown reveals the WHOLE catalogue, so changing the
  // service is never trapped inside the filtered platform.
  await expect(page.getByRole('button', { name: /TikTok Followers/ })).toBeVisible()

  // Click TikTok → the active chip switches.
  const tiktokChip = page.locator('[data-platform-chip="tiktok"]')
  await tiktokChip.click()
  await expect(tiktokChip).toHaveAttribute('aria-pressed', 'true')
  await expect(facebookChip).toHaveAttribute('aria-pressed', 'false')

  await page.getByPlaceholder(/Select a service/).click()
  await expect(page.getByRole('button', { name: /TikTok Followers/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Facebook Page Likes/ })).toBeVisible()
})

test('platform chip narrows the Category combobox to matching categories', async ({
  page,
}) => {
  const category = page.getByPlaceholder(/Search or select a category/)
  // No chip → every platform's categories are listed (plus All).
  await category.click()
  await expect(page.locator('[data-category-option]')).toHaveCount(6) // All + 5 platforms

  // Click Facebook → only categories whose name mentions facebook remain.
  await page.locator('[data-platform-chip="facebook"]').click()
  await category.click()
  await expect(page.locator('[data-category-option]')).toHaveText([
    'All categories',
    'Facebook',
  ])

  // Switch to TikTok → the list narrows to TikTok categories.
  await page.locator('[data-platform-chip="tiktok"]').click()
  await category.click()
  await expect(page.locator('[data-category-option]')).toHaveText([
    'All categories',
    'TikTok',
  ])
})

test('clearing the Service selection removes the details and order form', async ({ page }) => {
  // Pick a service first (details + order form appear).
  await page.getByPlaceholder(/Search all services/).fill('TikTok Followers')
  await pickService(page, 'TikTok Followers')
  await expect(page.getByRole('heading', { name: 'TikTok Followers', level: 3 })).toBeVisible()
  await expect(page.getByLabel('Link to your page or post')).toBeVisible()

  // Click the × in the Service field → service + order form disappear.
  await page.getByRole('button', { name: 'Clear service' }).click()
  await expect(page.getByRole('heading', { name: 'TikTok Followers', level: 3 })).toHaveCount(0)
  await expect(page.getByText('Pick a service above to get started.')).toBeVisible()
  await expect(page.getByLabel('Link to your page or post')).toHaveCount(0)
})

test('clicking the Service field with a chosen service opens the full catalogue', async ({
  page,
}) => {
  // Pick a service — its name stays in the field.
  await page.getByPlaceholder(/Search all services/).fill('TikTok Followers')
  await pickService(page, 'TikTok Followers')
  await expect(page.getByPlaceholder(/Select a service/)).toHaveValue('TikTok Followers')

  // Clicking the field opens the whole catalogue grouped by category.
  await page.getByPlaceholder(/Select a service/).click()
  await expect(page.getByRole('button', { name: /Facebook Page Likes/ })).toBeVisible()
  await expect(page.locator('[data-group-label="Facebook"]')).toBeVisible()

  // Picking a different service auto-updates the details + order form. The
  // row may sit below the panel's fold — scroll it into view first.
  const fbRow = page.getByRole('button', { name: /Facebook Page Likes/ })
  await fbRow.scrollIntoViewIfNeeded()
  await fbRow.click()
  await expect(page.getByRole('heading', { name: 'Facebook Page Likes', level: 3 })).toBeVisible()
  await expect(page.getByPlaceholder(/Search or select a category/)).toHaveValue('Facebook')
})

test('category loads its services first; the open combobox shows every category', async ({
  page,
}) => {
  // Pick the Facebook category from the searchable combobox.
  await page.getByPlaceholder(/Search or select a category/).click()
  await page.locator('[data-category-option="Facebook"]').click()

  // The Service field auto-loads the selected category's services first.
  await page.getByPlaceholder(/Select a service/).click()
  await expect(page.getByRole('button', { name: /Facebook Page Likes/ })).toBeVisible()

  // Opening the dropdown to change the service shows ALL categories as
  // their own groups — the active category leads but never cages the list.
  await expect(page.getByRole('button', { name: /TikTok Followers/ })).toBeVisible()
  await expect(page.locator('[data-group-label="TikTok"]')).toBeVisible()
})

test('typing a nonsense category shows the no-results message', async ({ page }) => {
  const field = page.getByPlaceholder(/Search or select a category/)
  await field.click()
  await field.pressSequentially('zzzzzz-no-such-category')
  await expect(page.getByText('No categories match “zzzzzz-no-such-category”.')).toBeVisible()
})

test('category group headers collapse and expand their services', async ({
  page,
}) => {
  // Open the combobox — every category is its own collapsible group, and
  // all groups start expanded.
  await page.getByPlaceholder(/Select a service/).click()
  const fbGroup = page.locator('[data-group-label="Facebook"]')
  await expect(fbGroup).toBeVisible()
  await expect(fbGroup).toHaveAttribute('aria-expanded', 'true')
  const fbRow = page.getByRole('button', { name: /Facebook Page Likes/ })
  await expect(fbRow).toBeVisible()

  // Click the header → the group collapses and its services hide.
  await fbGroup.click()
  await expect(fbGroup).toHaveAttribute('aria-expanded', 'false')
  await expect(fbRow).toHaveCount(0)

  // Click again → expands, services come back.
  await fbGroup.click()
  await expect(fbGroup).toHaveAttribute('aria-expanded', 'true')
  await expect(fbRow).toBeVisible()
})

test('changing the category resets the service and order form', async ({ page }) => {
  // Pick a service and fill the order form.
  await page.getByPlaceholder(/Search all services/).fill('TikTok Followers')
  await pickService(page, 'TikTok Followers')
  await expect(page.getByRole('heading', { name: 'TikTok Followers', level: 3 })).toBeVisible()
  await page.getByLabel('Link to your page or post').fill('https://www.tiktok.com/@e2e-user')
  await expect(page.getByLabel('Link to your page or post')).toHaveValue(
    'https://www.tiktok.com/@e2e-user',
  )

  // Switch category → the service + order form reset to the empty state.
  await page.getByPlaceholder(/Search or select a category/).click()
  await page.locator('[data-category-option="Facebook"]').click()
  await expect(page.getByPlaceholder(/Select a service/)).toHaveValue('')
  await expect(page.getByRole('heading', { name: 'TikTok Followers', level: 3 })).toHaveCount(0)
  await expect(page.getByText('Pick a service above to get started.')).toBeVisible()

  // The dropdown still reveals every category, so changing service is easy.
  await page.getByPlaceholder(/Select a service/).click()
  await expect(page.getByRole('button', { name: /TikTok Followers/ })).toBeVisible()
})

test('orders are paid from the wallet; empty balance prompts a top-up', async ({ page }) => {
  // Fresh bootstrap user has a $0.00 wallet.
  await expect(page.getByText('$0.00').first()).toBeVisible()

  // Pick a service and configure an order that costs more than $0.
  await page.getByPlaceholder(/Search all services/).fill('TikTok Followers')
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
  await page.addInitScript((t) => localStorage.setItem('digitalsmm_session_token', t), token)

  await page.goto('/dashboard/services')
  await expect(page.getByText('$5.00').first()).toBeVisible()

  await page.getByPlaceholder(/Search all services/).fill('TikTok Followers')
  await pickService(page, 'TikTok Followers')

  await page.getByLabel('Link to your page or post').fill('https://www.tiktok.com/@e2e-user')
  await page.getByPlaceholder(/50\s*–\s*10,000/).fill('1000') // 1000 × $0.90/1k = $0.90 ≤ $5.00

  await page.getByRole('button', { name: /Place order/ }).click()

  // Redirected to the new order's detail page.
  await page.waitForURL(/\/dashboard\/orders\/[a-f0-9]{24}$/)
})

test('order again: prefills the Explore form from a previous order', async ({
  page,
  request,
}) => {
  // Funded user places an order (same steps as the happy path).
  const { token, payment, webhookSecret } = await bootstrap(request)
  await settleTopUp(request, payment, webhookSecret)
  await page.addInitScript((t) => localStorage.setItem('digitalsmm_session_token', t), token)

  await page.goto('/dashboard/services')
  await page.getByPlaceholder(/Search all services/).fill('TikTok Followers')
  await pickService(page, 'TikTok Followers')
  await page.getByLabel('Link to your page or post').fill('https://www.tiktok.com/@e2e-user')
  await page.getByPlaceholder(/50\s*–\s*10,000/).fill('2500')
  await page.getByRole('button', { name: /Place order/ }).click()
  await page.waitForURL(/\/dashboard\/orders\/[a-f0-9]{24}$/)

  // 'Order again' takes us back to Explore with the form pre-filled.
  await page.getByRole('button', { name: /Order again/ }).click()
  await page.waitForURL(/\/dashboard\/services/)

  // Same service selected (combobox + details panel), category auto-set.
  await expect(page.getByRole('heading', { name: 'TikTok Followers', level: 3 })).toBeVisible()
  await expect(page.getByPlaceholder(/Select a service/)).toHaveValue('TikTok Followers')
  await expect(page.getByPlaceholder(/Search or select a category/)).toHaveValue('TikTok')

  // Link + quantity carried over.
  await expect(page.getByLabel('Link to your page or post')).toHaveValue(
    'https://www.tiktok.com/@e2e-user',
  )
  await expect(page.locator('input[type="number"]')).toHaveValue('2500')

  // The platform chip is auto-activated from the prefilled link.
  await expect(page.locator('[data-platform-chip="tiktok"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  // The charge reflects the carried quantity (2500 × $0.90/1k = $2.25).
  await expect(page.getByText('$2.25', { exact: true })).toBeVisible()
})

test('order again from the Orders list row prefills the Explore form', async ({
  page,
  request,
}) => {
  // Funded user places an order, then lands on the Orders list.
  const { token, payment, webhookSecret } = await bootstrap(request)
  await settleTopUp(request, payment, webhookSecret)
  await page.addInitScript((t) => localStorage.setItem('digitalsmm_session_token', t), token)

  await page.goto('/dashboard/services')
  await page.getByPlaceholder(/Search all services/).fill('TikTok Followers')
  await pickService(page, 'TikTok Followers')
  await page.getByLabel('Link to your page or post').fill('https://www.tiktok.com/@e2e-user')
  await page.getByPlaceholder(/50\s*–\s*10,000/).fill('3000')
  await page.getByRole('button', { name: /Place order/ }).click()
  await page.waitForURL(/\/dashboard\/orders\/[a-f0-9]{24}$/)

  await page.goto('/dashboard/orders')
  await expect(page.getByRole('heading', { name: 'Orders' })).toBeVisible()

  // The row's 'Order again' icon button jumps straight to a prefilled form.
  await page.getByRole('button', { name: 'Order again' }).click()
  await page.waitForURL(/\/dashboard\/services/)

  await expect(page.getByRole('heading', { name: 'TikTok Followers', level: 3 })).toBeVisible()
  await expect(page.getByPlaceholder(/Select a service/)).toHaveValue('TikTok Followers')
  await expect(page.getByPlaceholder(/Search or select a category/)).toHaveValue('TikTok')
  await expect(page.getByLabel('Link to your page or post')).toHaveValue(
    'https://www.tiktok.com/@e2e-user',
  )
  await expect(page.locator('input[type="number"]')).toHaveValue('3000')
  // The platform chip is auto-activated from the prefilled link.
  await expect(page.locator('[data-platform-chip="tiktok"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  // 3000 × $0.90/1k = $2.70
  await expect(page.getByText('$2.70', { exact: true })).toBeVisible()
})
