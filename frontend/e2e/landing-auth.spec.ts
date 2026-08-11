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
  await page.addInitScript((t) => localStorage.setItem('digitalsmm_session_token', t), token)
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

test('footer links navigate to real pages instead of # placeholders', async ({
  page,
  request,
}) => {
  const token = await bootstrapToken(request)
  await page.addInitScript((t) => localStorage.setItem('digitalsmm_session_token', t), token)
  await page.goto('/')

  const footer = page.locator('footer')

  // Product column → real dashboard routes (auth-gated, session already valid).
  await footer.getByText('Explore Services', { exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard\/services/)

  await page.goto('/')
  await footer.getByText('Wallet & KHQR', { exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard\/wallet/)

  await page.goto('/')
  await footer.getByText('Order Status', { exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard\/orders/)
})

test('legal footer links open the legal pages', async ({ page }) => {
  await page.goto('/')
  const footer = page.locator('footer')

  const legal = [
    { link: 'Terms of Service', url: /\/terms/, heading: 'Terms of Service' },
    { link: 'Privacy Policy', url: /\/privacy/, heading: 'Privacy Policy' },
    { link: 'Refund Policy', url: /\/refund-policy/, heading: 'Refund Policy' },
    { link: 'Cookies', url: /\/cookies/, heading: 'Cookies Policy' },
  ]

  for (const { link, url, heading } of legal) {
    await page.goto('/')
    await footer.getByText(link, { exact: true }).click()
    await expect(page).toHaveURL(url)
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible()
    // Back-home link returns to the landing page.
    await page.getByRole('link', { name: /Back to home/ }).click()
    await expect(page).toHaveURL('/')
  }
})

test('navbar Services routes signed-out users into the sign-in flow', async ({
  page,
}) => {
  await page.goto('/')
  const nav = page.locator('header')

  // Clicking Services as a guest goes through the auth guard, which
  // sends them to sign-in with a redirect back to the catalog.
  await nav.getByRole('link', { name: 'Services', exact: true }).click()
  await expect(page).toHaveURL(/\/sign-in\?redirect=\/dashboard\/services/)

  // In-page section anchors still scroll (fixed header no longer covers them).
  await page.goto('/')
  await nav.getByRole('link', { name: 'How it works', exact: true }).click()
  await expect(page).toHaveURL(/#how-it-works/)
  const howItWorks = page.locator('#how-it-works')
  await expect(howItWorks).toBeInViewport()
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

test('header shows the infinite promo marquee; scrolling hides it to keep the navbar', async ({
  page,
}) => {
  await page.goto('/')

  // The promotional ticker sits at the top of the fixed header with the
  // promo phrases scrolling through (no logo inside — it lives in the navbar).
  const marquee = page.getByRole('region', { name: 'Promotions' })
  await expect(marquee).toBeVisible()
  await expect(marquee.getByText('Fast Delivery').first()).toBeVisible()
  await expect(marquee.getByText('Secure KHQR Payments').first()).toBeVisible()
  await expect(marquee.getByRole('img', { name: 'DigitalSMM' })).toHaveCount(0)

  // The nav brand is the real logo image now (not the old text wordmark).
  const nav = page.locator('header')
  await expect(nav.getByRole('img', { name: 'DigitalSMM' }).first()).toBeVisible()

  // Scrolling down collapses the marquee shell (max-h → 0) so only the
  // navbar remains pinned at the top — assert its box has collapsed.
  const shell = marquee.locator('..') // the max-h collapse wrapper
  await expect(shell).toBeVisible()
  await page.mouse.wheel(0, 600)
  await expect
    .poll(async () => (await shell.boundingBox())?.height ?? 0)
    .toBeLessThan(4)
})
