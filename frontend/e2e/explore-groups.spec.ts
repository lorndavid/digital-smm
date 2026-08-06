import { expect, test, type APIRequestContext } from '@playwright/test'

/**
 * Explore page subcategory grouping.
 *
 * Clicking a platform chip (Facebook / TikTok / Telegram …) must show the
 * platform's services grouped by kind — "FB Page Likes", "FB Post Likes",
 * "FB Video Views", "TikTok Followers", "TikTok Views" … — with clean group
 * chips, section headers and real provider prices (no markup).
 *
 * The browser-test backend seeds the mock provider catalogue (16 services),
 * so the storefront has real data to group.
 *
 * Requires the Playwright webServer stack (backend :4001, frontend :5199).
 * Run: npm run test:e2e -w frontend
 */

const BACKEND = 'http://localhost:4001'

async function bootstrapToken(request: APIRequestContext): Promise<string> {
  const boot = await request.post(`${BACKEND}/api/dev/test-bootstrap`)
  if (!boot.ok()) throw new Error(`test-bootstrap failed: ${boot.status()}`)
  const { token } = (await boot.json()) as { token: string }
  expect(token).toBeTruthy()
  return token
}

test.beforeEach(async ({ page, request }) => {
  const token = await bootstrapToken(request)
  // Inject the session BEFORE the app boots so authStore.init() revalidates it.
  await page.addInitScript((t) => localStorage.setItem('vidsmm_session_token', t), token)
  await page.goto('/dashboard/services')
  await expect(page.getByRole('heading', { name: 'Explore Services' })).toBeVisible()
})

test('Facebook chip shows grouped subcategories with real provider prices', async ({ page }) => {
  // No-markup promise is visible on the page.
  await expect(page.getByText(/no markup/i)).toBeVisible()

  // Click the Facebook platform chip.
  await page.getByRole('button', { name: /^Facebook$/ }).click()

  // Subcategory chips appear, one per service kind.
  await expect(page.getByRole('button', { name: /FB Page Likes/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /FB Post Likes/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /FB Video Views/ })).toBeVisible()

  // The all-groups view renders a section header (h2) per group.
  await expect(page.getByRole('heading', { name: /FB Page Likes/, level: 2 })).toBeVisible()
  await expect(page.getByRole('heading', { name: /FB Post Likes/, level: 2 })).toBeVisible()

  // Drill into a group → only that group's services render.
  await page.getByRole('button', { name: /FB Page Likes/ }).click()
  await expect(page.getByText('Facebook Page Likes', { exact: true })).toBeVisible()
  await expect(page.getByText('Facebook Post Likes', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Facebook Video Views', { exact: true })).toHaveCount(0)

  // Back to all groups restores every section.
  await page.getByRole('button', { name: /All groups/ }).click()
  await expect(page.getByRole('heading', { name: /FB Post Likes/, level: 2 })).toBeVisible()
})

test('TikTok chip groups by service kind and shows per-1K from-prices', async ({ page }) => {
  await page.getByRole('button', { name: /^TikTok$/ }).click()

  // Derived from service names: Followers / Likes / Views / Custom Comments.
  await expect(page.getByRole('button', { name: /TikTok Followers/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /TikTok Likes/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /TikTok Views/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /TikTok Custom Comments/ })).toBeVisible()

  // Group section headers (h2) render with the real per-1,000 price.
  // level: 2 disambiguates from the card title h3 of "TikTok Followers".
  await expect(page.getByRole('heading', { name: /TikTok Followers/, level: 2 })).toBeVisible()
  await expect(page.getByText(/from\s+\$0\.\d+\s*\/\s*1K/i).first()).toBeVisible()
})

test('platform search narrows groups client-side without a reload', async ({ page }) => {
  await page.getByRole('button', { name: /^Telegram$/ }).click()

  // Two groups for the mock Telegram catalogue.
  await expect(page.getByRole('button', { name: /Telegram Members/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Telegram Post Views/ })).toBeVisible()

  // Type "invites" → the client-side filter collapses to one group.
  await page.getByPlaceholder('Search services…').fill('invites')
  await expect(page.getByRole('button', { name: /Telegram Invites from Groups/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Telegram Members/ })).toHaveCount(0)
})
