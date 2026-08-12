import { expect, test, type Page } from '@playwright/test'

/**
 * Admin dashboard e2e — same quality gates as the customer whole-site spec:
 * every admin page must render its heading with no console errors, no page
 * errors and no failed requests, and pages must settle (no request leaks).
 *
 * Requires the Playwright webServer stack, which now also boots the admin
 * dev server on :5198 (proxying /api → the SAME test backend :4001). The
 * backend seeds a super admin (SUPER_ADMIN_EMAIL/PASSWORD in playwright.config)
 * so the full admin surface can be exercised.
 *
 * Run: npm run test:e2e -w frontend
 */

const ADMIN = 'http://localhost:5198'
// Must match the SUPER_ADMIN_EMAIL/PASSWORD env vars on the backend webServer
// entry in playwright.config.ts (read from env so a config change can't
// silently break this spec).
const ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL ?? 'superadmin@digitalsmm.test'
const ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD ?? 'SuperAdminTest!2026'

/** External font hosts — ignored by the network/console gates (offline CI). */
const EXTERNAL_OK = ['fonts.googleapis.com', 'fonts.gstatic.com']

interface Probe {
  requests: string[]
  failed: Array<{ status: number; url: string }>
  consoleErrors: string[]
  pageErrors: string[]
}

function installProbes(page: Page): Probe {
  const probe: Probe = { requests: [], failed: [], consoleErrors: [], pageErrors: [] }
  page.on('request', (req) => probe.requests.push(req.url()))
  page.on('response', (res) => {
    if (res.status() >= 400 && !EXTERNAL_OK.some((h) => res.url().includes(h))) {
      probe.failed.push({ status: res.status(), url: res.url() })
    }
  })
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    const locUrl = msg.location().url
    // The network gate ignores external hosts (offline CI); the console gate
    // must too — Chrome's console text omits the URL, so check it here.
    if (EXTERNAL_OK.some((h) => text.includes(h) || locUrl.includes(h))) return
    // Include the failing resource URL — Chrome's default text omits it.
    probe.consoleErrors.push(`${text} @ ${locUrl}`)
  })
  page.on('pageerror', (err) => probe.pageErrors.push(String(err)))
  return probe
}

function assertClean(probe: Probe, ctx: string): void {
  expect(probe.consoleErrors, `${ctx}: console errors`).toEqual([])
  expect(probe.pageErrors, `${ctx}: page errors`).toEqual([])
  const failures = probe.failed.filter((f) => !f.url.includes('/favicon.'))
  expect(failures.map((f) => `${f.status} ${f.url}`), `${ctx}: failed requests`).toEqual([])
}

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto(`${ADMIN}/login`)
  await expect(page.getByRole('heading', { name: 'DigitalSMM Admin' })).toBeVisible()
  await page.getByPlaceholder('admin@example.com').fill(email)
  await page.getByPlaceholder('Password').fill(password)
  await page.getByRole('button', { name: /Sign in/ }).click()
}

test('admin login: wrong password is rejected, correct credentials sign in', async ({ page }) => {
  // Wrong password → visible error, stays on the login page.
  await login(page, ADMIN_EMAIL, 'WrongPassword!999')
  await expect(page.getByText(/Sign-in failed|Invalid/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'DigitalSMM Admin' })).toBeVisible()

  // Correct credentials → lands on the dashboard.
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD)
  await expect(page).toHaveURL(`${ADMIN}/`)
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
  await expect(page.getByText('Super admin').first()).toBeVisible()
})

test('every admin page renders cleanly and settles (full admin surface)', async ({ page }) => {
  const probe = installProbes(page)
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD)
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()

  const pages = [
    { path: '/', heading: 'Dashboard' },
    { path: '/services', heading: 'Services' },
    { path: '/categories', heading: 'Categories' },
    { path: '/users', heading: 'Users' },
    { path: '/orders', heading: 'Orders' },
    { path: '/payments', heading: 'Payments' },
    { path: '/announcements', heading: 'Announcements' },
    { path: '/settings', heading: 'Settings' },
    { path: '/admins', heading: 'Admins & Roles' },
  ]

  for (const { path, heading } of pages) {
    const start = Date.now()
    await page.goto(`${ADMIN}${path}`)
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible({
      timeout: 12_000,
    })
    console.log(`[admin] ${path} → h1 in ${Date.now() - start}ms`)
    // The h1 is static on some pages and renders before the mount data
    // finishes loading (e.g. /services loads categories first, then the list).
    // Wait for the initial data fetch to complete before measuring settle.
    await page
      .waitForLoadState('networkidle', { timeout: 15_000 })
      .catch(() => undefined)
    // Page must settle: no new requests keep firing after content is visible.
    const before = probe.requests.length
    await page.waitForTimeout(1600)
    const newReqs = probe.requests.slice(before)
    expect(
      newReqs,
      `${path}: new requests after settle (leaking timer/interval?)`,
    ).toEqual([])
  }

  assertClean(probe, 'admin surface')

  // Sign out returns to the login page.
  await page.getByRole('button', { name: /Sign out/ }).first().click()
  await expect(page).toHaveURL(`${ADMIN}/login`)
})

test('admin services search filters the list (alias-based search)', async ({ page }) => {
  const probe = installProbes(page)
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD)
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()

  await page.goto(`${ADMIN}/services`)
  await expect(page.getByRole('heading', { name: 'Services', level: 1 })).toBeVisible()
  await expect(page.locator('tbody tr').first()).toBeVisible()

  // Type an alias shorthand and search — the list must filter to matches.
  await page.getByPlaceholder('Search services…').fill('facebook live stream')
  await page.getByPlaceholder('Search services…').press('Enter')
  await expect
    .poll(() => page.locator('tbody tr').count())
    .toBeGreaterThanOrEqual(1)
  const rows = await page.locator('tbody tr').allTextContents()
  const joined = rows.join(' ').toLowerCase()
  expect(joined, 'admin service search must return alias matches').toContain('facebook')
  assertClean(probe, 'admin services search')
})
