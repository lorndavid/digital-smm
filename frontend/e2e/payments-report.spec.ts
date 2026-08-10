import { createHmac, randomUUID } from 'node:crypto'
import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test'

/**
 * Payments page — summary + PDF report export.
 *
 * A fresh bootstrap user settles a $5 KHQR top-up; the Payments page must
 * show that amount in the Top-ups summary card and let the user download a
 * clean PDF statement for any preset period (Today / This week / This month /
 * All time).
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

test('payments page shows settled summary and exports a PDF statement', async ({
  page,
  request,
}) => {
  const { token, payment, webhookSecret } = await bootstrap(request)
  await settleTopUp(request, payment, webhookSecret)
  await page.addInitScript((t) => localStorage.setItem('vidsmm_session_token', t), token)

  await page.goto('/dashboard/payments')
  await expect(page.getByRole('heading', { name: 'Payments' })).toBeVisible()

  // The settled $5 top-up appears in the summary cards (amounts are paid-only).
  const cardWith = (label: string) =>
    page.locator('.summary-card').filter({ has: page.getByText(label, { exact: true }) })
  await expect(cardWith('Top-ups')).toContainText('$5.00')
  await expect(cardWith('Total settled')).toContainText('$5.00')
  await expect(cardWith('Transactions')).toContainText('1')

  // The timeline lists the top-up with the paid badge.
  await expect(page.getByText('Wallet top-up')).toBeVisible()
  await expect(page.getByText('Paid', { exact: true }).first()).toBeVisible()

  // Export menu offers the four report periods.
  await page.getByRole('button', { name: 'Export PDF' }).click()
  for (const label of ['Today', 'This week', 'This month', 'All time']) {
    await expect(page.getByRole('button', { name: `Export ${label}`, exact: true })).toBeVisible()
  }

  // Downloading "Today" produces a PDF statement.
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export Today', exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^vidsmm-payments-\d{4}-\d{2}-\d{2}\.pdf$/)

  // The PDF should be a real file with content (header, table, totals).
  const stream = await download.createReadStream()
  let bytes = 0
  for await (const chunk of stream) bytes += (chunk as Buffer).byteLength
  expect(bytes).toBeGreaterThan(5000)
})
