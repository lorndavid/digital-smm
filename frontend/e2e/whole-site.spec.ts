import { expect, test, type APIRequestContext, type APIResponse, type Page } from '@playwright/test'
import { createHmac, randomUUID } from 'node:crypto'

/**
 * Whole-site e2e — walks EVERY customer route and the full buy-flow, with
 * three always-on quality gates:
 *
 *   1. CLEAN: no console errors, no page errors, no 4xx/5xx responses.
 *   2. NO LEAKS: pages settle — after content is visible no new requests
 *      keep firing (catches runaway intervals/timers), and no URL is hit
 *      more than a sane number of times (catches duplicate-fetch storms).
 *      The payment page's SSE + 3s polling and the order detail's 5s live
 *      polling must STOP the moment the user navigates away (SPA unmount).
 *   3. NOT TOO SLOW: key content becomes visible within a budget; timings
 *      are logged so regressions are visible in CI output.
 *
 * Requires the Playwright webServer stack (backend :4001, frontend :5199).
 * Run: npm run test:e2e -w frontend
 */

const BACKEND = 'http://localhost:4001'

/** External font hosts — ignored by the network/console gates (offline CI). */
const EXTERNAL_OK = ['fonts.googleapis.com', 'fonts.gstatic.com']

/** URLs that are allowed to repeat within a single page visit (live systems). */
const REPEAT_OK = [
  '/api/payment/status',
  '/api/payment/events',
  // Order detail + orders list poll every 5s while an order is in flight.
  '/api/orders',
]

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

// ---------------------------------------------------------------------------
// Quality-gate harness
// ---------------------------------------------------------------------------

interface Probe {
  requests: Array<{ url: string; ts: number }>
  failed: Array<{ status: number; url: string }>
  consoleErrors: string[]
  pageErrors: string[]
}

/**
 * Installs network + console probes on a page and returns the collector.
 *
 * `allowAuthMe401` whitelists the ONE expected non-200: on public pages the
 * SPA probes /api/auth/me on boot to detect a returning session, which
 * legitimately 401s when signed out (the browser logs it as a failed
 * resource). Everything else must be clean.
 */
function installProbes(page: Page, opts: { allowAuthMe401?: boolean } = {}): Probe {
  const probe: Probe = { requests: [], failed: [], consoleErrors: [], pageErrors: [] }
  let authMe401s = 0
  page.on('request', (req) => probe.requests.push({ url: req.url(), ts: Date.now() }))
  page.on('response', (res) => {
    const url = res.url()
    if (res.status() >= 400 && !EXTERNAL_OK.some((h) => url.includes(h))) {
      if (opts.allowAuthMe401 && res.status() === 401 && url.includes('/api/auth/me')) {
        authMe401s += 1
        return
      }
      probe.failed.push({ status: res.status(), url })
    }
  })
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    if (EXTERNAL_OK.some((h) => text.includes(h))) return
    // The signed-out session probe's 401 resource error is expected only when
    // we actually saw that allowed /api/auth/me 401 (never mask real errors).
    if (
      opts.allowAuthMe401 &&
      authMe401s > 0 &&
      /Failed to load resource: the server responded with a status of 401/.test(text)
    ) {
      authMe401s -= 1
      return
    }
    probe.consoleErrors.push(text)
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

/** Asserts no single URL was requested more than `max` times. When `from`
 *  is given, only requests after that index count (per-navigation storms). */
function assertNoRequestStorm(probe: Probe, ctx: string, max = 3, from = 0): void {
  const byUrl = new Map<string, number>()
  for (const r of probe.requests.slice(from)) {
    const path = r.url.split('?')[0]
    if (REPEAT_OK.some((p) => path.includes(p))) continue
    byUrl.set(path, (byUrl.get(path) ?? 0) + 1)
  }
  const storms = [...byUrl.entries()].filter(([, n]) => n > max)
  expect(
    storms.map(([u, n]) => `${u} ×${n}`),
    `${ctx}: request storm (same URL fetched >${max}x)`,
  ).toEqual([])
}

/** Measures a navigation (goto → key content visible) and enforces a budget. */
async function navAndExpect(
  page: Page,
  url: string,
  locator: ReturnType<Page['locator']>,
  budgetMs = 12_000,
): Promise<number> {
  const start = Date.now()
  await page.goto(url)
  await expect(locator).toBeVisible({ timeout: budgetMs })
  const elapsed = Date.now() - start
  console.log(`[whole-site] ${url} → content in ${elapsed}ms`)
  return elapsed
}

/** Waits for the page to settle, then asserts no NEW requests start. */
async function assertSettles(probe: Probe, page: Page, ctx: string): Promise<void> {
  // Some pages render a static heading before their mount data finishes
  // (wallet/profile topbar refetch) — let the initial fetch complete first.
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined)
  const before = probe.requests.length
  await page.waitForTimeout(1800)
  const newReqs = probe.requests.slice(before)
  const real = newReqs.filter(
    (r) =>
      !REPEAT_OK.some((p) => r.url.includes(p)) &&
      !EXTERNAL_OK.some((h) => r.url.includes(h)),
  )
  expect(real.map((r) => r.url), `${ctx}: new requests after settle`).toEqual([])
}

async function signIn(page: Page, request: APIRequestContext): Promise<void> {
  const { token } = await bootstrap(request)
  await page.addInitScript((t) => localStorage.setItem('digitalsmm_session_token', t), token)
}

// ---------------------------------------------------------------------------
// Signed-out route walk
// ---------------------------------------------------------------------------

test.describe('signed-out routes render cleanly', () => {
  for (const route of [
    { path: '/', heading: '#home' },
    { path: '/sign-in', heading: 'h1', text: 'Welcome back' },
    { path: '/terms', heading: 'h1', text: 'Terms of Service' },
    { path: '/privacy', heading: 'h1', text: 'Privacy Policy' },
    { path: '/refund-policy', heading: 'h1', text: 'Refund Policy' },
    { path: '/cookies', heading: 'h1', text: 'Cookies Policy' },
    { path: '/403', heading: 'h1', text: 'Access denied' },
    { path: '/500', heading: 'h1', text: 'Something went wrong' },
    { path: '/no-such-page-xyz', heading: 'h1', text: 'Page not found' },
    {
      path: '/payment-result?status=success&payment_id=test&reference_id=PAY-TEST',
      heading: 'h1',
    },
  ] as Array<{ path: string; heading: string; text?: string }>) {
    test(`route ${route.path} renders cleanly and settles`, async ({ page }) => {
      // Public pages probe /api/auth/me on boot → expected 401 when signed out.
      const probe = installProbes(page, { allowAuthMe401: true })
      const loc = route.text
        ? page.locator(route.heading).filter({ hasText: route.text })
        : page.locator(route.heading).first()
      await navAndExpect(page, route.path, loc)
      assertClean(probe, route.path)
      assertNoRequestStorm(probe, route.path)
      await assertSettles(probe, page, route.path)
    })
  }
})

// ---------------------------------------------------------------------------
// Signed-in route walk
// ---------------------------------------------------------------------------

test.describe('signed-in dashboard routes render cleanly', () => {
  for (const route of [
    { path: '/dashboard', heading: 'h1' },
    { path: '/dashboard/services', heading: 'h1', text: 'Explore Services' },
    { path: '/dashboard/favorites', heading: 'h1', text: 'Favourites' },
    { path: '/dashboard/orders', heading: 'h1', text: 'Orders' },
    { path: '/dashboard/wallet', heading: 'h1', text: 'Wallet' },
    { path: '/dashboard/payments', heading: 'h1', text: 'Payments' },
    { path: '/dashboard/profile', heading: 'h1', text: 'Profile' },
    { path: '/dashboard/settings', heading: 'h1', text: 'Settings' },
  ] as Array<{ path: string; heading: string; text?: string }>) {
    test(`route ${route.path} renders cleanly and settles`, async ({ page, request }) => {
      await signIn(page, request)
      const probe = installProbes(page)
      const loc = route.text
        ? page.locator(route.heading).filter({ hasText: route.text })
        : page.locator(route.heading).first()
      await navAndExpect(page, route.path, loc)
      assertClean(probe, route.path)
      assertNoRequestStorm(probe, route.path)
      await assertSettles(probe, page, route.path)
    })
  }
})

// ---------------------------------------------------------------------------
// Full user journey — the company workflow
// ---------------------------------------------------------------------------

test('full journey: explore → order → track → payments → wallet, clean & leak-free', async ({
  page,
  request,
}) => {
  const { token, payment, webhookSecret } = await bootstrap(request)
  await settleTopUp(request, payment, webhookSecret) // $5.00 wallet
  const probe = installProbes(page)
  await page.addInitScript((t) => localStorage.setItem('digitalsmm_session_token', t), token)

  // Snapshot the probe index before each navigation so per-page storm checks
  // only count the requests of THAT page (the layout topbar legitimately
  // refetches the wallet on every mount — once per page).
  let from = 0
  // Land on Explore Services first — the journey starts there.
  await page.goto('/dashboard/services')
  const pageSteps: Array<() => Promise<void>> = [
    // 1. Explore: search, pick a service.
    async () => {
      await expect(page.locator('h1').filter({ hasText: 'Explore Services' })).toBeVisible()
      const searchBox = page.getByPlaceholder(/Search all services/)
      await searchBox.fill('TikTok Followers')
      await page.getByRole('button', { name: /TikTok Followers/ }).first().click()
      await expect(
        page.getByRole('heading', { name: 'TikTok Followers', level: 3 }),
      ).toBeVisible()
      // 2. Order: link + quantity (1000 × $0.90/1k = $0.90).
      await page.getByLabel('Link to your page or post').fill('https://www.tiktok.com/@e2e-user')
      await page.getByPlaceholder(/50\s*–\s*10,000/).fill('1000')
      await page.getByRole('button', { name: /Place order/ }).click()
      // 3. Order detail: live status page renders with the order number.
      await page.waitForURL(/\/dashboard\/orders\/[a-f0-9]{24}$/)
      await expect(page.locator('h1').filter({ hasText: /Order #/ })).toBeVisible()
      await expect(page.getByText('Order timeline')).toBeVisible()
    },
    // 4. Orders list shows the order.
    async () => {
      await page.goto('/dashboard/orders')
      await expect(page.locator('h1').filter({ hasText: 'Orders' })).toBeVisible()
      await expect(page.getByText('TikTok Followers').first()).toBeVisible()
    },
    // 5. Payments shows the order charge.
    async () => {
      await page.goto('/dashboard/payments')
      await expect(page.locator('h1').filter({ hasText: 'Payments' })).toBeVisible()
    },
    // 6. Wallet reflects the spend: $5.00 − $0.90 = $4.10.
    async () => {
      await page.goto('/dashboard/wallet')
      await expect(page.locator('h1').filter({ hasText: 'Wallet' })).toBeVisible()
      await expect(page.locator('main').getByText('$4.10', { exact: true })).toBeVisible()
    },
  ]

  for (const step of pageSteps) {
    await step()
    // Per-page storm check: only this page's requests (index ≥ from).
    assertNoRequestStorm(probe, 'full journey', 3, from)
    from = probe.requests.length
  }

  // The whole journey must be clean (console/page/network).
  assertClean(probe, 'full journey')
})

// ---------------------------------------------------------------------------
// Request-leak tests
// ---------------------------------------------------------------------------

test('leaving the payment page stops SSE + polling (no request leak)', async ({
  page,
  request,
}) => {
  const { token, payment } = await bootstrap(request)
  const probe = installProbes(page)
  await page.addInitScript((t) => localStorage.setItem('digitalsmm_session_token', t), token)

  await page.goto(`/pay/${payment.referenceId}`)
  await expect(page.locator('img[alt="KHQR"]')).toBeVisible()
  await expect(page.locator('.live-ring')).toBeVisible()

  // The live system is active: SSE stream open + status polling running.
  await expect
    .poll(() =>
      probe.requests.filter((r) => r.url.includes('/api/payment/events')).length,
    )
    .toBeGreaterThan(0)

  // SPA-navigate away via the header logo (NOT a full page reload) — the
  // component must tear down its SSE stream + poll timer on unmount.
  await page.locator('a[href="/dashboard"]').first().click()
  await page.waitForURL(/\/dashboard$/)
  await expect(page.locator('h1').first()).toBeVisible()

  const before = probe.requests.length
  // Wait longer than one 3s poll cycle — any surviving timer would fire now.
  await page.waitForTimeout(4200)
  const leaked = probe.requests
    .slice(before)
    .filter((r) => r.url.includes('/api/payment/'))
  expect(leaked.map((r) => r.url), 'payment SSE/polling continued after leaving').toEqual([])
})

test('typing in Find your service fires no server requests (client-side search)', async ({
  page,
  request,
}) => {
  await signIn(page, request)
  const probe = installProbes(page)
  await page.goto('/dashboard/services')
  await expect(page.locator('h1').filter({ hasText: 'Explore Services' })).toBeVisible()

  const servicesBefore = probe.requests.filter((r) => r.url.includes('/api/services')).length
  await page.getByPlaceholder(/Search all services/).pressSequentially('facebook live stream', {
    delay: 40,
  })
  await expect(page.locator('[data-search-service]').first()).toBeVisible()
  // Typing must be 100% client-side — zero new catalogue requests.
  await page.waitForTimeout(600)
  const servicesAfter = probe.requests.filter((r) => r.url.includes('/api/services')).length
  expect(servicesAfter).toBe(servicesBefore)
  assertClean(probe, 'search typing')
})

test('leaving the order detail page stops its 5s live polling', async ({ page, request }) => {
  const { token, payment, webhookSecret } = await bootstrap(request)
  await settleTopUp(request, payment, webhookSecret)
  const probe = installProbes(page)
  await page.addInitScript((t) => localStorage.setItem('digitalsmm_session_token', t), token)

  // Place an order and land on its detail page (which polls every 5s).
  await page.goto('/dashboard/services')
  await page.getByPlaceholder(/Search all services/).fill('TikTok Followers')
  await page.getByRole('button', { name: /TikTok Followers/ }).first().click()
  await page.getByLabel('Link to your page or post').fill('https://www.tiktok.com/@e2e-user')
  await page.getByPlaceholder(/50\s*–\s*10,000/).fill('1000')
  await page.getByRole('button', { name: /Place order/ }).click()
  await page.waitForURL(/\/dashboard\/orders\/[a-f0-9]{24}$/)
  await expect(page.locator('h1').filter({ hasText: /Order #/ })).toBeVisible()

  // Wait past one 5s poll cycle to prove live polling is actually running.
  await page.waitForTimeout(5500)
  const detailPolls = probe.requests.filter((r) =>
    /\/api\/orders\/[a-f0-9]{24}/.test(r.url),
  ).length
  expect(detailPolls, 'order detail live polling never started').toBeGreaterThanOrEqual(2)

  // SPA-navigate away (sidebar Dashboard) — the timer must be cleared.
  await page.locator('aside').getByRole('link', { name: 'Dashboard' }).click()
  await page.waitForURL(/\/dashboard$/)
  const before = probe.requests.length
  await page.waitForTimeout(6000) // longer than one poll cycle
  const leaked = probe.requests
    .slice(before)
    .filter((r) => /\/api\/orders\/[a-f0-9]{24}/.test(r.url))
  expect(leaked.map((r) => r.url), 'order-detail polling continued after leaving').toEqual([])
})
