import { expect, test, type APIRequestContext, type APIResponse, type Page } from '@playwright/test'
import { buildAbaDeepLink } from '../src/utils/deepLink'

/**
 * ABA Mobile deep link (bank-chip quick actions on the KHQR payment page).
 *
 * The payment page builds the ABA deep link from the raw KHQR payload:
 *   abamobilebank://ababank.com?type=payway&qrcode={KHQR}
 * The KHQR embeds the exact amount, so ABA Mobile opens with the charge
 * already pre-filled — no amount/reference query params are needed.
 *
 * Custom-scheme navigations are blocked in headless Chromium, so the test
 * proves the two branches of `openBankApp` through the seam it can observe:
 * `window.open` (the hosted-checkout fallback) is overridable, and the
 * touch gate is read from `window.matchMedia` at click time.
 *
 *   - Touch device (matchMedia faked)  → deep-link branch: window.open must
 *     NOT fire, page must not navigate away.
 *   - Desktop (no touch)               → fallback branch: window.open fires
 *     with the hosted checkout URL.
 *
 * Requires the Playwright webServer stack from frontend/playwright.config.ts
 * (backend :4001 with MOCK_CHECKOUT_URL set, frontend :5199).
 * Run: npm run test:e2e -w frontend
 */

const BACKEND = 'http://localhost:4001'

async function ok(res: APIResponse, what: string): Promise<void> {
  if (!res.ok()) {
    throw new Error(`${what} failed: ${res.status()} ${await res.text().catch(() => '')}`)
  }
}

/** Installs a window.open spy + an optional touch-device matchMedia fake
 * that runs before the app boots (isTouchDevice reads matchMedia live). */
async function installProbes(
  page: Page,
  opts: { touch?: boolean } = {},
): Promise<void> {
  await page.addInitScript(({ touch }) => {
    ;(window as unknown as { __openCalls: { url: string; target: string; features: string }[] }).__openCalls = []
    // Spy window.open — the observable side effect of the hosted-checkout fallback.
    window.open = ((url?: string | URL, target?: string, features?: string) => {
      ;(window as unknown as { __openCalls: { url: string; target: string; features: string }[] }).__openCalls.push({
        url: String(url ?? ''),
        target: target ?? '',
        features: features ?? '',
      })
      return null
    }) as typeof window.open
    // Fake the touch-device media query so the ABA deep-link gate is
    // deterministic on any browser context (no device emulation needed).
    if (touch !== undefined) {
      const orig = window.matchMedia.bind(window)
      window.matchMedia = (query: string) => {
        if (query === '(hover: none) and (pointer: coarse)') {
          return {
            matches: touch,
            media: query,
            onchange: null,
            addListener: () => undefined,
            removeListener: () => undefined,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
            dispatchEvent: () => false,
          } as unknown as MediaQueryList
        }
        return orig(query)
      }
    }
  }, opts)
}

async function openPaymentPage(page: Page, request: APIRequestContext) {
  const boot = await request.post(`${BACKEND}/api/dev/test-bootstrap`)
  await ok(boot, 'test-bootstrap')
  const { token, payment } = (await boot.json()) as {
    token: string
    payment: { referenceId: string; qrString: string; checkoutUrl: string; amount: number }
  }
  expect(payment.qrString).toBeTruthy()
  expect(payment.checkoutUrl).toContain('checkout.cutluy.test') // mock env override active
  await page.addInitScript((t) => localStorage.setItem('digitalsmm_session_token', t), token)
  await page.goto(`/pay/${payment.referenceId}`)
  await expect(page.locator('img[alt="KHQR"]')).toBeVisible()
  return payment
}

test('ABA deep link embeds the KHQR payload (amount pre-fill contract)', async () => {
  // Pure unit assertion on the URL builder — no browser needed.
  const qrString = '00020101021229370016com.cutluy0104PAY0' + 'x'.repeat(40) + '6304AB12'
  const link = buildAbaDeepLink(qrString)
  expect(link).toMatch(/^abamobilebank:\/\/ababank\.com\?type=payway&qrcode=/)
  // The KHQR (with the amount inside) is carried verbatim, URL-encoded.
  expect(decodeURIComponent(link.split('qrcode=')[1])).toBe(qrString)
})

test('touch device: tapping ABA takes the deep-link branch (no hosted-checkout popup)', async ({
  page,
  request,
}) => {
  await installProbes(page, { touch: true })
  const payment = await openPaymentPage(page, request)

  const abaChip = page.getByRole('button', { name: /ABA Bank/ })
  await expect(abaChip).toBeEnabled()

  await abaChip.click()

  // Deep-link branch: window.location.href = abamobilebank://… — the fallback
  // (window.open) must NOT have fired, and the page must not have navigated
  // away to the hosted checkout or anywhere else.
  const opens = await page.evaluate(() => (window as unknown as { __openCalls: unknown[] }).__openCalls)
  expect(opens).toHaveLength(0)
  expect(page.url()).toContain(`/pay/${payment.referenceId}`)
})

test('desktop: tapping ABA falls back to the hosted checkout via window.open', async ({
  page,
  request,
}) => {
  await installProbes(page, { touch: false })
  const payment = await openPaymentPage(page, request)

  // The mock now supplies a checkout URL, so the hosted-checkout button and
  // every bank chip are actionable.
  await expect(page.getByRole('button', { name: /Open Secure Checkout/i })).toBeVisible()

  const abaChip = page.getByRole('button', { name: /ABA Bank/ })
  await expect(abaChip).toBeEnabled()
  await abaChip.click()

  const opens = await page.evaluate(() =>
    (window as unknown as { __openCalls: { url: string; features: string }[] }).__openCalls,
  )
  expect(opens).toHaveLength(1)
  expect(opens[0].url).toBe(payment.checkoutUrl)
  expect(opens[0].features).toContain('noopener')
})
