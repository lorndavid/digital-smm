/**
 * Load test — 100 concurrent users through the KHQR payment flow.
 *
 * Proves three things with the REAL production code:
 *   1. 100 concurrent payment creations succeed.
 *   2. The provider-sync TTL cache caps CutLuy API calls — 3 bursts of
 *      100 concurrent status polls must hit the provider exactly once
 *      per payment (100 total), not 300.
 *   3. The SSE bus holds 100 concurrent streams and delivers a paid
 *      event to every single one when 100 webhooks fire at once, with
 *      exactly-once wallet crediting (no double-charge on replay).
 *
 * Uses the MOCK payment provider (PAYMENT_PROVIDER=mock) so the test is
 * free, instant and never touches real CutLuy quota — the provider call
 * counter is what we measure, and the mock's getPayment is frozen at
 * 'pending' so the phases stay deterministic.
 *
 * Runs against a throwaway Mongo database (vidsmm_loadtest_<ts>) that is
 * dropped when the test finishes.
 *
 * Usage: npx tsx scripts/loadtest-payment.ts
 */
import dns from 'node:dns'
dns.setServers(['1.1.1.1', '8.8.8.8'])
// Force the mock provider BEFORE any app module is imported (the payment
// service captures the provider singleton at import time).
process.env.PAYMENT_PROVIDER = 'mock'

import { performance } from 'node:perf_hooks'
import type { AddressInfo } from 'node:net'

const DB_NAME = `vidsmm_loadtest_${Date.now()}`
const N = 100
const TOPUP = 5

function loadTestUri(): string {
  // URL parsing handles scheme, auth, host, port and query safely — the
  // earlier string surgery glued the query onto the hostname.
  const u = new URL(process.env.MONGODB_URI ?? '')
  u.pathname = `/${DB_NAME}`
  return u.toString()
}

function maskUri(uri: string): string {
  return uri.replace(/\/\/([^@]+)@/, '//***@') // hide credentials
}

function pct(sorted: number[], p: number): number {
  if (!sorted.length) return 0
  const i = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return Math.round(sorted[Math.max(0, i)] ?? 0)
}

function summarize(name: string, samples: number[]): void {
  const sorted = [...samples].sort((a, b) => a - b)
  const avg = samples.length ? Math.round(samples.reduce((a, b) => a + b, 0) / samples.length) : 0
  console.log(
    `  ${name.padEnd(30)} n=${String(samples.length).padStart(3)}  avg=${avg}ms  p50=${pct(sorted, 50)}ms  p95=${pct(sorted, 95)}ms  max=${Math.round(sorted[sorted.length - 1] ?? 0)}ms`,
  )
}

interface SseHandle {
  controller: AbortController
  snapshot: Promise<number> // ms from connect to first snapshot
  paid: Promise<number> // wall-clock performance.now() when 'paid' arrived
}

/** Resolves the promise or falls back after `ms` — a hung stream can never hang the test. */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))])
}

/** Opens a payment events SSE stream with the customer JWT. */
function openSse(url: string, token: string): SseHandle {
  const controller = new AbortController()
  let snapDone = false
  let resolveSnap!: (v: number) => void
  let resolvePaid!: (v: number) => void
  const snapshot = new Promise<number>((r) => (resolveSnap = r))
  const paid = new Promise<number>((r) => (resolvePaid = r))

  void (async () => {
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      })
      if (!res.ok || !res.body) throw new Error(`SSE HTTP ${res.status}`)
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      const started = performance.now()
      let buffer = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const chunks = buffer.split('\n\n')
        buffer = chunks.pop() ?? ''
        for (const chunk of chunks) {
          const line = chunk.split('\n').find((l) => l.startsWith('data: '))
          if (!line) continue
          const payload = JSON.parse(line.slice(6)) as Record<string, unknown>
          if (payload?.payment && !snapDone) {
            snapDone = true
            resolveSnap(performance.now() - started)
          }
          if (payload?.status === 'paid') {
            resolvePaid(performance.now())
            controller.abort()
            return
          }
        }
      }
      if (!snapDone) {
        snapDone = true
        resolveSnap(-1)
      }
    } catch {
      if (!snapDone) {
        snapDone = true
        resolveSnap(-1)
      }
    }
  })()

  return { controller, snapshot, paid }
}

async function main() {
  await import('dotenv/config')
  const mongoose = (await import('mongoose')).default
  const { createApp } = await import('../src/app.js')
  const { userRepository } = await import('../src/repositories/user.repository.js')
  const { paymentService } = await import('../src/services/payment.service.js')
  const { getPaymentProvider } = await import('../src/services/payment/payment.factory.js')
  const { signCustomerToken } = await import('../src/modules/auth/session.js')
  const { WalletModel } = await import('../src/models/wallet.model.js')

  const started = performance.now()
  const memBefore = process.memoryUsage().rss
  console.log(`\n🚀 VID-SMM payment load test — ${N} concurrent users (mock provider, db=${DB_NAME})\n`)

  const uri = loadTestUri()
  console.log(`connecting: ${maskUri(uri)}`)
  await mongoose.connect(uri)
  console.log('connected to throwaway db ✓\n')

  const server = createApp().listen(0)
  await new Promise<void>((r) => server.once('listening', r))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`

  try {
    // -------------------------------------------------------------------
    // Phase 1 — 100 concurrent payment creations
    // -------------------------------------------------------------------
    const users = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        userRepository.upsertFromGoogle({
          sub: `loadtest-${i}`,
          email: `loadtest-${i}@vidsmm.local`,
          name: `Load Tester ${i}`,
          picture: '',
          emailVerified: true,
        }),
      ),
    )
    const tokens = await Promise.all(
      users.map((u) =>
        signCustomerToken({
          id: u._id.toString(),
          email: u.email,
          name: u.name,
          avatarUrl: '',
          role: 'customer',
        }),
      ),
    )

    // Instrument the provider: count getPayment calls and freeze the mock at
    // 'pending' so the phases stay deterministic (no timer-driven settling).
    const provider = getPaymentProvider()
    let providerCalls = 0
    provider.getPayment = (async () => {
      providerCalls += 1
      return { status: 'pending' }
    }) as typeof provider.getPayment

    const createSamples: number[] = []
    const created = await Promise.all(
      users.map(async (u, i) => {
        const t0 = performance.now()
        const { payment } = await paymentService.createPayment(u._id.toString(), {
          purpose: 'topup',
          amount: TOPUP,
        })
        createSamples.push(performance.now() - t0)
        return { userId: u._id.toString(), referenceId: payment.referenceId }
      }),
    )
    console.log(`Phase 1 — ${N} concurrent KHQR payment creations`)
    console.log(`  created: ${created.length}/${N} ok ✓`)
    summarize('create latency', createSamples)

    // -------------------------------------------------------------------
    // Phase 2 — 3 bursts of 100 concurrent status polls (TTL cap proof)
    // -------------------------------------------------------------------
    console.log(`\nPhase 2 — 3 × ${N} concurrent status polls (provider-sync TTL)`)

    const pollLatency: number[] = []
    const perBurstCalls: number[] = []
    for (let burst = 0; burst < 3; burst++) {
      const before = providerCalls
      await Promise.all(
        created.map(async (c) => {
          const t0 = performance.now()
          await paymentService.status(c.userId, c.referenceId)
          pollLatency.push(performance.now() - t0)
        }),
      )
      perBurstCalls.push(providerCalls - before)
    }
    const providerCallsAfterPolling = providerCalls
    console.log(`  provider.getPayment calls per burst: ${perBurstCalls.join(' + ')} = ${providerCallsAfterPolling}`)
    console.log(
      `  ${providerCallsAfterPolling === N ? '✅ TTL CAP PROVEN — exactly 100 provider calls, not 300' : `⚠️ expected ${N}, got ${providerCallsAfterPolling}`}`,
    )
    summarize('status latency (300 calls)', pollLatency)

    // -------------------------------------------------------------------
    // Phase 3 — SSE bus: 100 concurrent streams + 100 concurrent webhooks
    // -------------------------------------------------------------------
    console.log(`\nPhase 3 — SSE bus: ${N} concurrent streams`)

    // created and tokens have identical lengths, so the indexed token is always present.
    const handles = created.map((c, i) => {
      const token = tokens[i] as string
      return {
        ref: c.referenceId,
        sse: openSse(`${base}/payment/events?reference=${encodeURIComponent(c.referenceId)}`, token),
      }
    })

    const snapshotTimes = await Promise.all(handles.map((h) => withTimeout(h.sse.snapshot, 15_000, -1)))
    console.log(`  streams opened: ${snapshotTimes.filter((t) => t >= 0).length}/${N} (initial snapshot delivered) ✓`)
    summarize('snapshot latency', snapshotTimes.filter((t) => t >= 0))

    const webhookAt = performance.now()
    const webhookResults = await Promise.all(
      handles.map((h) =>
        paymentService.handleProviderWebhook({
          provider: 'mock',
          referenceId: h.ref,
          event: {
            type: 'payment.completed',
            eventId: `evt-loadtest-${h.ref}`,
            providerPaymentId: `mock-${h.ref}`,
            status: 'paid',
          },
        }),
      ),
    )
    const processDone = performance.now()
    const paidTimes = await Promise.all(handles.map((h) => withTimeout(h.sse.paid, 15_000, -1)))
    const deliveries = paidTimes.filter((t) => t > 0).map((t) => t - webhookAt)
    const delivered = deliveries.length
    const totalProcessMs = processDone - webhookAt
    console.log(`  webhooks fulfilled: ${webhookResults.filter((r) => r.payment).length}/${N} ✓`)
    console.log(`  SSE paid events delivered: ${delivered}/${N} ${delivered === N ? '✓' : '✗'}`)
    summarize('webhook→SSE delivery', deliveries)
    console.log(`  webhook processing (100 concurrent, incl. DB writes): ${Math.round(totalProcessMs)}ms total`)
    // Bus overhead = delivery time minus the time the webhook batch took to
    // finish processing. If this is ~0ms, the in-memory SSE bus adds nothing.
    summarize(
      'SSE bus overhead (delivery − processing)',
      deliveries.map((d) => Math.max(0, d - totalProcessMs)),
    )

    // -------------------------------------------------------------------
    // Phase 4 — wallet fulfilment, exactly once (no double-charge)
    // -------------------------------------------------------------------
    console.log(`\nPhase 4 — wallet fulfilment (exactly-once)`)

    const wallets = await Promise.all(
      created.map(async (c) => {
        const w = await WalletModel.findOne({ user: c.userId }).lean().exec()
        const topups = (w?.transactions ?? []).filter((tx) => tx.refType === 'topup')
        return { ref: c.referenceId, balance: w?.balance ?? 0, topups: topups.length }
      }),
    )
    const correct = wallets.filter((w) => w.balance === TOPUP && w.topups === 1).length
    console.log(`  wallets credited exactly ${TOPUP} USD with 1 topup tx: ${correct}/${N} ${correct === N ? '✓' : '✗'}`)

    // Duplicate webhook replay must NOT double-credit.
    const replaySample = wallets.slice(0, 10)
    await Promise.all(
      replaySample.map((w) =>
        paymentService.handleProviderWebhook({
          provider: 'mock',
          referenceId: w.ref,
          event: {
            type: 'payment.completed',
            eventId: `evt-replay-${w.ref}`,
            providerPaymentId: `mock-${w.ref}`,
            status: 'paid',
          },
        }),
      ),
    )
    const refToUser = new Map(created.map((c) => [c.referenceId, c.userId]))
    const after = await Promise.all(
      replaySample.map(async (w) => {
        const uid = refToUser.get(w.ref)
        const doc = uid ? await WalletModel.findOne({ user: uid }).lean().exec() : null
        return doc?.balance ?? 0
      }),
    )
    const noDouble = after.every((b) => b === TOPUP)
    console.log(`  duplicate-webhook replay on ${replaySample.length} payments: balances unchanged ${noDouble ? '✓' : '✗'}`)

    // -------------------------------------------------------------------
    // Summary
    // -------------------------------------------------------------------
    const memAfter = process.memoryUsage().rss
    console.log(`\n═══ SUMMARY ═══`)
    console.log(`total wall time: ${Math.round((performance.now() - started) / 1000)}s`)
    console.log(`rss before: ${Math.round(memBefore / 1024 / 1024)} MB → after: ${Math.round(memAfter / 1024 / 1024)} MB`)
    const sseSnapshotCalls = providerCalls - providerCallsAfterPolling
    console.log(
      `provider.getPayment calls: ${providerCallsAfterPolling} from polling bursts; the ${N} SSE snapshot checks added ${sseSnapshotCalls} (${sseSnapshotCalls === 0 ? 'all absorbed by the TTL cache — they ran inside the 10s window ✓' : 'each stream did its own provider check'})`,
    )

    handles.forEach((h) => h.sse.controller.abort())
  } finally {
    server.close()
    // Nuke the throwaway database — never leave test data behind.
    try {
      await mongoose.connection.db?.dropDatabase()
      console.log('\nthrowaway db dropped ✓')
    } catch (err) {
      console.log('\nwarning: could not drop db —', err instanceof Error ? err.message : err)
    }
    await mongoose.disconnect()
  }
}

main().catch((err) => {
  console.error('\nLOAD TEST FAILED:', err instanceof Error ? err.message : err)
  process.exit(1)
})
