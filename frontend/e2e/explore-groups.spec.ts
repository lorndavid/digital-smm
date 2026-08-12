import { createHmac, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import dns from 'node:dns'
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
 * The browser-test backend seeds the mock provider catalogue (22 services,
 * including Facebook/TikTok/YouTube live-stream services) and test-bootstrap
 * creates a fresh customer with an EMPTY wallet (the $5 top-up stays pending
 * until the test settles it via a signed webhook).
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

/**
 * Hard-deletes a service directly in the throwaway browser-test database —
 * the same way a provider re-sync purge can remove services that existing
 * orders reference. The admin API refuses this ("orders exist — disable it
 * instead"), so the regression test must go through the same DB path the
 * provider sync uses. Connects to the newest digitalsmm_browsertest_* DB.
 */
async function deleteServiceInDb(serviceId: string): Promise<void> {
  const uriLine = readFileSync(resolve(process.cwd(), '../backend/.env'), 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith('MONGODB_URI='))
  expect(uriLine).toBeTruthy()
  const uri = uriLine!.slice('MONGODB_URI='.length)
  // Pin DNS servers — same fix as backend/src/config/database.ts (Atlas SRV
  // lookups fail on some Windows/ISP networks otherwise).
  dns.setServers(['1.1.1.1', '8.8.8.8'])
  const { MongoClient, ObjectId } = await import('mongodb')
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 })
  try {
    await client.connect()
    const admin = client.db().admin()
    const { databases } = await admin.listDatabases()
    const dbs = (databases as Array<{ name: string }>)
      .map((d) => d.name)
      .filter((name) => name.startsWith('digitalsmm_browsertest_'))
      .sort()
    expect(dbs.length).toBeGreaterThan(0)
    // Newest test DB is the one the current webServer booted.
    const db = client.db(dbs[dbs.length - 1])
    const del = await db.collection('services').deleteOne({ _id: new ObjectId(serviceId) })
    expect(del.deletedCount).toBe(1)
  } finally {
    await client.close()
  }
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
  // and shows a LIVE ranked dropdown of matching services as you type.
  await page.getByPlaceholder(/Search all services/).fill('Facebook Page Likes')
  await expect(page.getByText(/results/)).toBeVisible()
  // The best match (all three words) leads the ranked list.
  await expect(page.locator('[data-search-service]').first()).toContainText(
    'Facebook Page Likes',
  )

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
  await expect(page.locator('[data-search-service]').first()).toBeVisible()
  // All 6 Facebook-named services (3 plain + 3 live-stream) surface.
  await expect(page.locator('[data-search-service]')).toHaveCount(6)

  // Clicking a service still auto-picks it AND its category.
  await page.locator('[data-search-service]').filter({ hasText: 'Facebook Page Likes' }).click()
  await expect(page.getByRole('heading', { name: 'Facebook Page Likes', level: 3 })).toBeVisible()
  await expect(page.getByPlaceholder(/Search or select a category/)).toHaveValue('Facebook')
})

test('multi-word search ranks best matches first across name + category', async ({
  page,
}) => {
  // "facebook post" → Facebook Post Likes matches BOTH words, Facebook Page
  // Likes only 'facebook' — so Post Likes leads and Page Likes trails behind
  // (ranked search: partial matches are included, best first).
  await page.getByPlaceholder(/Search all services/).fill('facebook post')
  await expect(page.getByRole('button', { name: /Facebook Post Likes/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Facebook Page Likes/ })).toBeVisible()
  await expect(page.locator('[data-search-service]').first()).toContainText('Facebook Post Likes')

  // Clicking the result still auto-picks the service and its category.
  await page.getByRole('button', { name: /Facebook Post Likes/ }).click()
  await expect(page.getByRole('heading', { name: 'Facebook Post Likes', level: 3 })).toBeVisible()
  await expect(page.getByPlaceholder(/Search or select a category/)).toHaveValue('Facebook')
})

test('multi-word search matches across service name and category words', async ({
  page,
}) => {
  // "tiktok views" → 'TikTok Views (High Retention)' matches both words and
  // leads; 'TikTok Followers' only matches 'tiktok' (its category) so it
  // trails in the ranked list instead of disappearing.
  await page.getByPlaceholder(/Search all services/).fill('tiktok views')
  await expect(
    page.getByRole('button', { name: /TikTok Views \(High Retention\)/ }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: /TikTok Followers/ })).toBeVisible()
  await expect(page.locator('[data-search-service]').first()).toContainText(
    'TikTok Views (High Retention)',
  )
})

test('multi-word phrase like "facebook live stream" ranks live services first', async ({
  page,
}) => {
  // The catalogue now HAS live-stream services. A strict AND match would still
  // be safe, but the ranked any-word search leads with the full-scoring
  // Facebook Live services (name AND category contain the words) while the
  // plain Facebook services (score via "facebook" only) trail behind.
  await page.getByPlaceholder(/Search all services/).fill('facebook live stream')
  await expect(page.getByRole('button', { name: /Facebook Live Stream Views/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Facebook Live Stream Likes/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Facebook Live Stream Comments/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Facebook Page Likes/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Facebook Post Likes/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Facebook Video Views/ })).toBeVisible()
  // The best matches (full phrase) lead the ranked list.
  await expect(page.locator('[data-search-service]').first()).toContainText(
    'Facebook Live Stream',
  )
  await expect(page.getByText(/result/)).toBeVisible()

  // Clicking a result still auto-picks the service + its category.
  await page.getByRole('button', { name: /Facebook Live Stream Views/ }).click()
  await expect(page.getByRole('heading', { name: 'Facebook Live Stream Views', level: 3 })).toBeVisible()
  await expect(page.getByPlaceholder(/Search or select a category/)).toHaveValue(
    'Facebook Live Stream',
  )
})

test('multi-word phrase like "tiktok live stream" surfaces TikTok services', async ({
  page,
}) => {
  // Any-word matching still surfaces every TikTok service, with the live
  // stream ones (name + category score) leading the ranked list.
  await page.getByPlaceholder(/Search all services/).fill('tiktok live stream')
  await expect(page.getByRole('button', { name: /TikTok Followers/ })).toBeVisible()
  await expect(
    page.getByRole('button', { name: /TikTok Views \(High Retention\)/ }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: /TikTok Live Stream Views/ })).toBeVisible()
  await expect(page.locator('[data-search-service]').first()).toContainText(
    'TikTok Live Stream',
  )

  // Clicking a result still auto-picks the service + its category.
  await page.getByRole('button', { name: /TikTok Followers/ }).click()
  await expect(page.getByRole('heading', { name: 'TikTok Followers', level: 3 })).toBeVisible()
  await expect(page.getByPlaceholder(/Search or select a category/)).toHaveValue('TikTok')
})

test('unknown phrases show a helpful no-results tip instead of an empty panel', async ({
  page,
}) => {
  // A nonsense phrase matches nothing in the mock catalogue — the dropdown
  // must still render guidance, never an invisible empty panel.
  await page.getByPlaceholder(/Search all services/).fill('zzzzz no such service')
  await expect(page.getByText(/No results found for/)).toBeVisible()
  await expect(page.getByText(/Try a keyword like/)).toBeVisible()
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

test('Facebook Live is a main chip: filters categories and services to facebook-live only', async ({
  page,
}) => {
  // The header has 6 main chips: the five platforms plus Facebook Live.
  const liveChip = page.locator('[data-live-chip]')
  await expect(liveChip).toBeVisible()

  // Click it → the 'facebook live' filter activates exactly like the other
  // platform chips (same facebook icon, no search box involved).
  await liveChip.click()
  await expect(liveChip).toHaveAttribute('aria-pressed', 'true')

  // The Category dropdown shows ONLY categories with 'facebook live' in
  // their name.
  const category = page.getByPlaceholder(/Search or select a category/)
  await category.click()
  await expect(page.locator('[data-category-option]')).toHaveText([
    'All categories',
    'Facebook Live Stream',
  ])
  await category.press('Escape')

  // The Service dropdown shows ONLY facebook-live services — plain Facebook
  // page/post/video services and every other platform never leak in.
  await page.getByPlaceholder(/Select a service/).click()
  await expect(page.getByRole('button', { name: /Facebook Live Stream Views/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Facebook Live Stream Likes/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Facebook Live Stream Comments/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Facebook Page Likes/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /TikTok Followers/ })).toHaveCount(0)
  await expect(page.locator('[data-group-label="TikTok"]')).toHaveCount(0)

  // Picking a live service auto-sets its category (the chip stays active).
  await page.getByRole('button', { name: /Facebook Live Stream Views/ }).click()
  await expect(
    page.getByRole('heading', { name: 'Facebook Live Stream Views', level: 3 }),
  ).toBeVisible()
  await expect(category).toHaveValue('Facebook Live Stream')

  // Clicking the chip again deactivates the filter.
  await liveChip.click()
  await expect(liveChip).toHaveAttribute('aria-pressed', 'false')
})

test('favourites: star a category, browse it from the Favourites tab, remove it', async ({
  page,
}) => {
  // Open the category dropdown — every category row has a star button.
  const category = page.getByPlaceholder(/Search or select a category/)
  await category.click()
  await expect(page.locator('[data-category-option="Facebook"]')).toBeVisible()

  // Star the Facebook category — the star flips to filled. The star is a
  // sibling of the row's select button, so scope it through the row.
  const facebookRow = page.locator('[data-category-option="Facebook"]').locator('..')
  const fbStar = facebookRow.locator('[data-fav-category]')
  await expect(fbStar).toHaveAttribute('data-favorited', 'false')
  await fbStar.click()
  await expect(fbStar).toHaveAttribute('data-favorited', 'true')
  await expect(facebookRow.getByRole('button', { name: /Remove Facebook from favourites/ })).toBeVisible()

  // The Favourites tab shows the category card with a count badge.
  await page.goto('/dashboard/favorites')
  await expect(page.locator('h1').filter({ hasText: 'Favourites' })).toBeVisible()
  await expect(page.getByText('Facebook').first()).toBeVisible()
  await expect(page.getByText('1 favourite')).toBeVisible()

  // Clicking the card jumps to Explore with the category auto-set and the
  // Service field empty (no service pre-selected, no order form).
  await page.locator('[data-favorite-category]').first().click()
  await page.waitForURL(/\/dashboard\/services\?category=/)
  await expect(page.getByPlaceholder(/Search or select a category/)).toHaveValue('Facebook')
  await expect(page.getByPlaceholder(/Select a service/)).toHaveValue('')
  await expect(page.locator('[data-order-form]')).toHaveCount(0)

  // Back to Favourites — removing the star empties the tab.
  await page.goto('/dashboard/favorites')
  await page.locator('[data-unfavorite]').click()
  await expect(page.getByText('No favourites yet')).toBeVisible()
  await expect(page.getByRole('button', { name: /Explore Services/ })).toBeVisible()
})

test('favourites filter toggle narrows the Category dropdown to starred categories', async ({
  page,
}) => {
  const category = page.getByPlaceholder(/Search or select a category/)
  const toggle = page.locator('[data-fav-filter]')

  // Open the dropdown — the filter toggle sits at the top of the panel and
  // the full category list is shown (All + 8 categories).
  await category.click()
  await expect(toggle).toBeVisible()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('[data-category-option]')).toHaveCount(9)

  // Star the Facebook category (star button is a sibling of the select row).
  const facebookRow = page.locator('[data-category-option="Facebook"]').locator('..')
  await facebookRow.locator('[data-fav-category]').click()
  await expect(facebookRow.locator('[data-fav-category]')).toHaveAttribute(
    'data-favorited',
    'true',
  )

  // Enable the filter → ONLY the starred category remains; 'All categories'
  // and every other platform's categories disappear.
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('[data-category-option]')).toHaveCount(1)
  await expect(page.locator('[data-category-option="Facebook"]')).toBeVisible()
  await expect(page.locator('[data-category-option="TikTok"]')).toHaveCount(0)
  await expect(page.locator('[data-category-option="All categories"]')).toHaveCount(0)

  // Toggle off → the full list returns.
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('[data-category-option]')).toHaveCount(9)

  // Unstar the last favourite, then enable the filter again → the dedicated
  // empty state points the user at the star buttons.
  await facebookRow.locator('[data-fav-category]').click()
  await expect(facebookRow.locator('[data-fav-category]')).toHaveAttribute(
    'data-favorited',
    'false',
  )
  await toggle.click()
  await expect(page.getByText(/No favourites yet/)).toBeVisible()
})

test('reopening the Category dropdown pins the selected category on top', async ({
  page,
}) => {
  const category = page.getByPlaceholder(/Search or select a category/)
  // Select the TikTok category from the dropdown.
  await category.click()
  await page.locator('[data-category-option="TikTok"]').click()

  // Click the field again — it reopens even though focus never left the
  // input (picking a row keeps focus), and the selected category is pinned
  // on top right after 'All categories' (its star sits beside it).
  await category.click()

  // Reopen → the selected category leads the list right after
  // 'All categories' (its star button sits beside it, ready to favourite).
  const options = page.locator('[data-category-option]')
  await expect(options.first()).toHaveText('All categories')
  await expect(options.nth(1)).toHaveText('TikTok')
})

test('mobile: the 6 filter chips form a 3-column × 2-row grid', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const chips = page.locator('[data-platform-chip]')
  await expect(chips).toHaveCount(6)

  // Row 1 (chips 0–2) share the same vertical position; chip 3 starts row 2
  // clearly lower → 3 columns × 2 rows on phones.
  const r1 = (await chips.nth(0).boundingBox())!
  const r1c = (await chips.nth(2).boundingBox())!
  const r2 = (await chips.nth(3).boundingBox())!
  expect(Math.abs(r1.y - r1c.y)).toBeLessThan(2)
  expect(r2.y).toBeGreaterThan(r1.y + 10)
  expect(r1.x).toBeLessThan(r1c.x)
})

test('platform chips scope the service dropdown to that platform only', async ({
  page,
}) => {
  // Header shows platform chips (replacing the wallet balance card).
  const facebookChip = page.locator('[data-platform-chip="facebook"]')
  await expect(facebookChip).toBeVisible()

  // Click Facebook → chip active; the Service dropdown shows ONLY Facebook
  // services — no other platform's services leak in.
  await facebookChip.click()
  await expect(facebookChip).toHaveAttribute('aria-pressed', 'true')

  await page.getByPlaceholder(/Select a service/).click()
  await expect(page.getByRole('button', { name: /Facebook Page Likes/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /TikTok Followers/ })).toHaveCount(0)
  await expect(page.locator('[data-group-label="TikTok"]')).toHaveCount(0)

  // Click TikTok → the active chip switches and the dropdown scopes to it.
  const tiktokChip = page.locator('[data-platform-chip="tiktok"]')
  await tiktokChip.click()
  await expect(tiktokChip).toHaveAttribute('aria-pressed', 'true')
  await expect(facebookChip).toHaveAttribute('aria-pressed', 'false')

  await page.getByPlaceholder(/Select a service/).click()
  await expect(page.getByRole('button', { name: /TikTok Followers/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Facebook Page Likes/ })).toHaveCount(0)
})

test('platform chip narrows the Category combobox to matching categories', async ({
  page,
}) => {
  const category = page.getByPlaceholder(/Search or select a category/)
  // No chip → every platform's categories are listed (plus All).
  await category.click()
  await expect(page.locator('[data-category-option]')).toHaveCount(9) // All + 8 categories

  // Click Facebook → only categories whose name mentions facebook remain.
  await page.locator('[data-platform-chip="facebook"]').click()
  await category.click()
  await expect(page.locator('[data-category-option]')).toHaveText([
    'All categories',
    'Facebook',
    'Facebook Live Stream',
  ])

  // Switch to TikTok → the list narrows to TikTok categories.
  await page.locator('[data-platform-chip="tiktok"]').click()
  await category.click()
  await expect(page.locator('[data-category-option]')).toHaveText([
    'All categories',
    'TikTok',
    'TikTok Live Stream',
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

test('clicking the Service field with a chosen service scopes to its category', async ({
  page,
}) => {
  // Pick a service — its name stays in the field and its category auto-sets.
  await page.getByPlaceholder(/Search all services/).fill('TikTok Followers')
  await pickService(page, 'TikTok Followers')
  await expect(page.getByPlaceholder(/Select a service/)).toHaveValue('TikTok Followers')

  // Clicking the field opens ONLY the chosen service's category group — no
  // services from other categories appear.
  await page.getByPlaceholder(/Select a service/).click()
  await expect(page.locator('[data-group-label="TikTok"]')).toBeVisible()
  await expect(page.getByRole('button', { name: /TikTok Followers/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Facebook Page Likes/ })).toHaveCount(0)

  // Clearing the category reveals the whole catalogue grouped again.
  await page.getByPlaceholder(/Select a service/).press('Escape')
  await page.getByPlaceholder(/Search or select a category/).click()
  await page.locator('[data-category-option="All categories"]').click()
  await page.getByPlaceholder(/Select a service/).click()
  await expect(page.getByRole('button', { name: /Facebook Page Likes/ })).toBeVisible()
})

test('a selected category scopes the service dropdown to that category only', async ({
  page,
}) => {
  // Pick the Facebook category from the searchable combobox.
  await page.getByPlaceholder(/Search or select a category/).click()
  await page.locator('[data-category-option="Facebook"]').click()

  // The Service dropdown shows ONLY the selected category's services,
  // grouped under its header — no other categories appear.
  await page.getByPlaceholder(/Select a service/).click()
  await expect(page.locator('[data-group-label="Facebook"]')).toBeVisible()
  await expect(page.getByRole('button', { name: /Facebook Page Likes/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /TikTok Followers/ })).toHaveCount(0)
  await expect(page.locator('[data-group-label="TikTok"]')).toHaveCount(0)
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

  // The dropdown now shows only the new category's services.
  await page.getByPlaceholder(/Select a service/).click()
  await expect(page.getByRole('button', { name: /Facebook Page Likes/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /TikTok Followers/ })).toHaveCount(0)
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

  // The SMMWiz service id is visible on the order detail (ID #… chip).
  await expect(page.getByText(/ID #\d+/).first()).toBeVisible()
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

test('orders whose service was deleted render gracefully (no null crash)', async ({
  page,
  request,
}) => {
  // Regression: an order whose service ref is dangling (service removed from
  // the catalogue — e.g. provider re-sync) must render the Orders list and
  // the order detail WITHOUT crashing. `typeof null === 'object'` used to
  // slip past the old `typeof order.service === 'object'` guards and throw
  // "Cannot read properties of null (reading 'name')".
  //
  // IMPORTANT: the ordered service is created uniquely for THIS test and
  // deleted at the end — parallel specs share the same throwaway DB, so a
  // test must never delete a catalogue service other specs order.

  // Funded user + admin session.
  const { token, payment, webhookSecret } = await bootstrap(request)
  await settleTopUp(request, payment, webhookSecret)
  await page.addInitScript((t) => localStorage.setItem('digitalsmm_session_token', t), token)

  const adminLogin = await request.post(`${BACKEND}/api/admin/auth/login`, {
    data: {
      email: process.env.SUPER_ADMIN_EMAIL ?? 'superadmin@digitalsmm.test',
      password: process.env.SUPER_ADMIN_PASSWORD ?? 'SuperAdminTest!2026',
    },
  })
  await ok(adminLogin, 'admin login')
  const adminToken = (await adminLogin.json()).token as string
  const adminHeaders = { authorization: `Bearer ${adminToken}` }

  // Create a throwaway service only this test will order from.
  const unique = `Regression E2E ${randomUUID().slice(0, 8)}`
  const created = await request.post(`${BACKEND}/api/admin/services`, {
    headers: adminHeaders,
    data: {
      name: unique,
      type: 'Default',
      pricePerUnit: 0.9,
      min: 1,
      max: 10000,
      provider: 'mock',
      isActive: true,
    },
  })
  await ok(created, 'create throwaway service')
  const serviceId = (await created.json())._id as string
  expect(serviceId).toBeTruthy()

  // Place an order for that service via the API (wallet-funded, $5 settled).
  const order = await request.post(`${BACKEND}/api/orders`, {
    headers: { authorization: `Bearer ${token}` },
    data: {
      serviceId,
      link: 'https://www.tiktok.com/@regression-e2e',
      quantity: 10,
    },
  })
  await ok(order, 'place order')
  const orderId = (await order.json())._id as string
  expect(orderId).toBeTruthy()

  // Delete the ordered service DIRECTLY in the DB — the same path a
  // provider re-sync purge uses (the admin API refuses: "orders exist for
  // this service"). This is exactly the dangling-ref scenario from the
  // production crash.
  await deleteServiceInDb(serviceId)

  // Prove the dangling ref actually happened: the order's populated service
  // must now be null (Mongoose populate of a missing ref). If this assertion
  // fails, the test would pass vacuously without exercising the crash path.
  const orderAfter = await request.get(`${BACKEND}/api/orders/${orderId}`, {
    headers: { authorization: `Bearer ${token}` },
  })
  await ok(orderAfter, 'fetch order after delete')
  expect((await orderAfter.json()).service).toBeNull()

  // 1. The Orders list renders the order with a neutral fallback name — no
  // page error, no crash. (The table row exists and shows the order number.)
  await page.goto('/dashboard/orders')
  await expect(page.getByRole('heading', { name: 'Orders' })).toBeVisible()
  await expect(page.locator('tbody tr').first()).toBeVisible()
  await expect(page.locator('tbody tr').first()).toContainText('#')
  // The link + a status badge are present (status varies by mock delivery
  // timing — what matters is the row renders at all).
  await expect(page.locator('tbody tr').first()).toContainText('tiktok.com')
  await expect(page.locator('tbody tr').first()).toContainText(/Processing|Completed|In progress|Paid|Partial/)

  // 2. The order detail page also renders (hero + analytics), again without
  // crashing on the dangling service ref.
  await page.goto(`/dashboard/orders/${orderId}`)
  await expect(
    page.getByRole('heading', { name: new RegExp(`Order #`) }),
  ).toBeVisible()
  await expect(page.getByText('Quantity', { exact: true })).toBeVisible()
})
