import { expect, test, type APIRequestContext } from '@playwright/test'

/**
 * Landing page auth-awareness.
 *
 * When a visitor already has a session (their Google login is remembered in
 * localStorage), the landing page must NOT keep showing "Sign In / Get
 * Started": the navbar and hero switch to "Sign Out" + "Dashboard" so a
 * returning user can jump straight back in.
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

test('returning signed-in user sees Sign Out + Dashboard, never Sign In / Get Started', async ({
  page,
  request,
}) => {
  const token = await bootstrapToken(request)
  // Inject the session BEFORE the app boots so authStore.init() revalidates it.
  await page.addInitScript((t) => localStorage.setItem('vidsmm_session_token', t), token)
  await page.goto('/')

  const nav = page.locator('header')
  await expect(nav.getByRole('button', { name: 'Dashboard' })).toBeVisible()
  await expect(nav.getByRole('button', { name: /Sign In/ })).toHaveCount(0)
  await expect(nav.getByRole('button', { name: /Get Started/ })).toHaveCount(0)

  // Avatar chip (dashboard-topbar style). The bootstrap user has no photo,
  // so the gradient-initials fallback shows next to the name.
  const chip = nav.locator('button[aria-label="Account menu"]')
  await expect(chip).toBeVisible()
  await expect(chip).toContainText('E2E Browser Tester')
  await expect(chip.getByText('E2', { exact: true })).toBeVisible() // initials fallback

  // Wallet balance chip next to the avatar (fresh user → $0.00).
  const balance = nav.getByRole('button', { name: 'Wallet balance' })
  await expect(balance).toBeVisible()
  await expect(balance).toContainText('$0.00')

  // Clicking the chip opens the account dropdown (modern SaaS navbar).
  await chip.click()
  for (const label of ['Profile', 'Wallet', 'Orders', 'Settings']) {
    // exact — the balance chip's aria-label "Wallet balance" contains "Wallet".
    await expect(nav.getByRole('button', { name: label, exact: true })).toBeVisible()
  }
  await expect(nav.getByRole('button', { name: 'Sign Out' })).toBeVisible()

  // Navigating through the dropdown goes to the (protected) dashboard page.
  await nav.getByRole('button', { name: 'Wallet', exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard\/wallet/)

  // Hero CTAs switch from "Start Now / Explore Services" to dashboard actions.
  const hero = page.locator('#home')
  await expect(hero.getByRole('button', { name: /Go to Dashboard/ })).toBeVisible()
  await expect(hero.getByRole('button', { name: /Sign Out/ })).toBeVisible()
  await expect(hero.getByRole('button', { name: /Start Now/ })).toHaveCount(0)
  await expect(hero.getByRole('button', { name: /Explore Services/ })).toHaveCount(0)

  // Bottom CTA too.
  const cta = page.locator('#contact')
  await expect(cta.getByRole('button', { name: /Go to Dashboard/ })).toBeVisible()
})

test('signed-out visitor still sees Sign In + Get Started', async ({ page }) => {
  await page.goto('/')

  const nav = page.locator('header')
  await expect(nav.getByRole('button', { name: 'Sign In' })).toBeVisible()
  await expect(nav.getByRole('button', { name: 'Get Started' })).toBeVisible()
  await expect(nav.getByRole('button', { name: 'Dashboard' })).toHaveCount(0)

  const hero = page.locator('#home')
  await expect(hero.getByRole('button', { name: /Start Now/ })).toBeVisible()
  await expect(hero.getByRole('button', { name: /Explore Services/ })).toBeVisible()
})
