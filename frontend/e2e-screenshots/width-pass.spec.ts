import { createHmac, randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { expect, test, type APIRequestContext, type APIResponse, type Page } from '@playwright/test'

/**
 * Dashboard width screenshot pass.
 *
 * Boots via playwright.screenshots.config.ts (backend :4001, frontend :5199,
 * admin :5174, 1920x1080 viewport). Captures a full-page PNG of every user
 * and admin dashboard route into shots/ and asserts the layout choices from
 * the width work hold:
 *   - no horizontal page overflow anywhere,
 *   - form pages (Profile / Settings, admin Settings) stay centered ≤ max-w-3xl,
 *   - the admin User Detail profile card is centered ≤ max-w-3xl,
 *   - data tables span the full content width (> 1200px).
 *
 * Run:  npx playwright test --config=playwright.screenshots.config.ts -w frontend
 */

const BACKEND = 'http://localhost:4001'
const ADMIN_ORIGIN = 'http://localhost:5174'
const SHOTS = 'shots'
const ADMIN_EMAIL = 'admin@screenshot.test'
const ADMIN_PASSWORD = 'screenshot-pass-123'

mkdirSync(SHOTS, { recursive: true })

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

interface Box {
  width: number
  centerDiff: number
  left: number
}

async function centeredColumn(page: Page): Promise<Box | null> {
  return page.evaluate(() => {
    const el = document.querySelector('.max-w-3xl')
    if (!el) return null
    const r = el.getBoundingClientRect()
    const p = el.parentElement?.getBoundingClientRect()
    const centerDiff = p ? Math.abs(p.left + p.width / 2 - (r.left + r.width / 2)) : 0
    return { width: r.width, centerDiff, left: r.left }
  })
}

async function noOverflow(page: Page, name: string): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, `${name}: horizontal overflow of ${overflow}px`).toBeLessThanOrEqual(1)
}

async function snap(page: Page, name: string, url: string, settleMs = 1200): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(settleMs)
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true })
  await noOverflow(page, name)
}

test('customer dashboard width pass', async ({ page, request }) => {
  // Seed real data: fund the wallet ($5 top-up) and place a few orders.
  const { token, payment, webhookSecret } = await bootstrap(request)
  await settleTopUp(request, payment, webhookSecret)

  const catalog = await request.get(`${BACKEND}/api/services?limit=50`)
  await ok(catalog, 'catalog fetch')
  const services = (((await catalog.json()) as { items: Array<{ _id: string; min?: number; max?: number; rate?: number }> }).items ?? [])

  const placed: string[] = []
  for (const s of services) {
    if (placed.length >= 3) break
    const qty = Math.max(s.min ?? 1, 500)
    if (s.max != null && qty > s.max) continue
    if (((s.rate ?? 1) / 1000) * qty > 1.5) continue
    const res = await request.post(`${BACKEND}/api/orders`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { serviceId: s._id, link: 'https://www.tiktok.com/@demo-user', quantity: qty },
    })
    if (res.ok()) {
      const order = (await res.json()) as { _id: string }
      placed.push(order._id)
    }
  }
  expect(placed.length, 'expected at least one seeded order').toBeGreaterThan(0)

  await page.addInitScript((t) => localStorage.setItem('vidsmm_session_token', t), token)

  const routes: Array<[string, string]> = [
    ['user-01-dashboard', '/dashboard'],
    ['user-02-services', '/dashboard/services'],
    ['user-03-orders', '/dashboard/orders'],
    ['user-04-order-detail', `/dashboard/orders/${placed[0]}`],
    ['user-05-wallet', '/dashboard/wallet'],
    ['user-06-payments', '/dashboard/payments'],
    ['user-07-profile', '/dashboard/profile'],
    ['user-08-settings', '/dashboard/settings'],
  ]
  for (const [name, path] of routes) {
    await snap(page, name, path)
  }

  // Form pages stay centered at ≤ max-w-3xl (768px + rounding).
  for (const [name, path] of [['user-07-profile', '/dashboard/profile'], ['user-08-settings', '/dashboard/settings']] as Array<[string, string]>) {
    await page.goto(path, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(900)
    const box = await centeredColumn(page)
    expect(box, `${name}: max-w-3xl column missing`).not.toBeNull()
    expect(box!.width, `${name}: column should be ≤ ~768px`).toBeLessThanOrEqual(800)
    expect(box!.centerDiff, `${name}: column should be centered`).toBeLessThan(24)
  }

  // The orders table uses the full content width (was max-w-6xl before).
  await page.goto('/dashboard/orders', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(900)
  const tableWidth = await page.evaluate(() => document.querySelector('table')?.getBoundingClientRect().width ?? 0)
  expect(tableWidth, 'orders table should span the full content width').toBeGreaterThan(1200)
})

test('admin dashboard width pass', async ({ page, request }) => {
  // Log in through the real admin UI.
  await page.goto(`${ADMIN_ORIGIN}/login`)
  await page.getByPlaceholder('admin@example.com').fill(ADMIN_EMAIL)
  await page.getByPlaceholder('Password').fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(`${ADMIN_ORIGIN}/`)
  await page.waitForTimeout(1200)

  // Grab the first customer id so the User Detail route can be captured.
  let userId = ''
  const token = await page.evaluate(() => localStorage.getItem('vidsmm_admin_token'))
  if (token) {
    const res = await request.get(`${BACKEND}/api/admin/users?limit=10`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok()) {
      const body = (await res.json()) as { items?: Array<{ _id: string }> }
      userId = body.items?.[0]?._id ?? ''
    }
  }

  const routes: Array<[string, string]> = [
    ['admin-01-dashboard', '/'],
    ['admin-02-services', '/services'],
    ['admin-03-categories', '/categories'],
    ['admin-04-users', '/users'],
    ['admin-05-orders', '/orders'],
    ['admin-06-payments', '/payments'],
    ['admin-07-announcements', '/announcements'],
    ['admin-08-settings', '/settings'],
  ]
  if (userId) routes.push(['admin-09-user-detail', `/users/${userId}`])

  for (const [name, path] of routes) {
    await snap(page, name, `${ADMIN_ORIGIN}${path}`)
  }

  // Admin Settings stays centered at ≤ max-w-3xl.
  await page.goto(`${ADMIN_ORIGIN}/settings`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(900)
  const settingsBox = await centeredColumn(page)
  expect(settingsBox, 'admin settings column missing').not.toBeNull()
  expect(settingsBox!.width, 'admin settings should be ≤ ~768px').toBeLessThanOrEqual(800)

  // Admin User Detail: profile card centered ≤ max-w-3xl, tables full-width.
  if (userId) {
    await page.goto(`${ADMIN_ORIGIN}/users/${userId}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1200)
    const card = await centeredColumn(page)
    expect(card, 'user detail profile card missing').not.toBeNull()
    expect(card!.width, 'user detail profile card should be ≤ ~768px').toBeLessThanOrEqual(800)
    expect(card!.centerDiff, 'user detail profile card should be centered').toBeLessThan(24)
    const tableWidth = await page.evaluate(() => document.querySelector('table')?.getBoundingClientRect().width ?? 0)
    expect(tableWidth, 'user detail table should span the full content width').toBeGreaterThan(1200)
  }
})
