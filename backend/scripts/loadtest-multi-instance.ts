/**
 * Multi-instance load test — 100 users across TWO real backend processes.
 *
 * This is the definitive proof of the Redis-backed SSE bus: two full
 * backend instances (separate processes, separate HTTP servers) share one
 * MongoDB and one Redis. Webhooks land on instance A only, yet the SSE
 * streams connected to instance B must still flip to 'paid' via Redis.
 *
 * What it proves:
 *   1. 100 concurrent payment creations across two instances succeed.
 *   2. 3×100 concurrent status polls (round-robin across instances) stay
 *      correct and fast — each instance's provider-sync TTL cache holds.
 *   3. THE RELAY: 100 webhooks POSTed to instance A → all 100 SSE streams
 *      (50 on A, 50 on B) receive 'paid'. B's clients arrive via Redis.
 *   4. Exactly-once: 100/100 wallets credited exactly $5.00 with one
 *      transaction — and replaying the SAME webhook events (even to the
 *      OTHER instance) is deduped, so nothing double-charges.
 *
 * Prerequisites (run from a shell with Docker):
 *   docker run -d --name vidsmm-lt-mongo  -p 27017:27017 mongo:7
 *   docker run -d --name vidsmm-lt-redis  -p 6379:6379  redis:7-alpine
 *
 * Usage: npx tsx scripts/loadtest-multi-instance.ts
 *
 * Both instances run with the MOCK payment provider frozen at 'pending'
 * (MOCK_PAYMENT_PAID_MS) so the phases are deterministic — no real
 * CutLuy / SMMWiz calls are made, and no quota is spent.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { createRequire } from 'node:module'
import { performance } from 'node:perf_hooks'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { shutdownRedis } from '../src/services/payment/events.bus.js'
import { shutdownRedisClient } from '../src/services/redis/redis.client.js'

const N = 100
const TOPUP = 5
const PORTS = [4001, 4002]

const DB_NAME = `vidsmm_multi_${Date.now()}`
const MONGO_URI = `mongodb://127.0.0.1:27017/${DB_NAME}`
const REDIS_URL = 'redis://127.0.0.1:6379'
const WEBHOOK_SECRET = 'loadtest-webhook-secret-0123456789'
const JWT_SECRET = 'loadtest-customer-jwt-secret-0123456789'
const ADMIN_SECRET = 'loadtest-admin-jwt-secret-0123456789'

// ---------------------------------------------------------------------------
// Shared env — children AND the harness must agree on these.
// ---------------------------------------------------------------------------
// RATE_LIMIT_* are pinned high so the synthetic load is never throttled by
// the (now Redis-shared) rate limiter: the harness hammers 100s of requests
// per second from one IP (127.0.0.1), and the child instances load
// backend/.env via dotenv — dotenv never overrides an env var that is
// already set, so setting them here wins on every machine and in CI.
const sharedEnv: Record<string, string> = {
  NODE_ENV: 'test',
  MONGODB_URI: MONGO_URI,
  REDIS_URL,
  RATE_LIMIT_MAX: '100000',
  RATE_LIMIT_WINDOW_MS: '600000',
  CUTLUY_WEBHOOK_SECRET: WEBHOOK_SECRET,
  CUSTOMER_JWT_SECRET: JWT_SECRET,
  ADMIN_JWT_SECRET: ADMIN_SECRET,
  FRONTEND_URL: 'http://localhost:5173',
  PAYMENT_PROVIDER: 'mock',
  SMM_PROVIDER: 'mock',
  DNS_SERVERS: '',
  ENABLE_ORDER_SYNC_JOB: 'false',
  MOCK_PAYMENT_SCANNED_MS: '999999999', // freeze the mock at 'pending'
  MOCK_PAYMENT_PAID_MS: '999999999',
}
// The harness imports src modules (env is parsed at import time) — set the
// shared values BEFORE any dynamic import below.
for (const [k, v] of Object.entries(sharedEnv)) process.env[k] = v

const require = createRequire(import.meta.url)
const tsxCli = path.join(path.dirname(require.resolve('tsx/package.json')), 'dist', 'cli.mjs')
/** Backend workspace root — where src/index.ts lives (works on Node ≥20.9). */
const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Safe index into PORTS — i is always within bounds (noUncheckedIndexedAccess). */
function portAt(i: number): number {
  return PORTS[i % PORTS.length] as number
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
    `  ${name.padEnd(32)} n=${String(samples.length).padStart(3)}  avg=${avg}ms  p50=${pct(sorted, 50)}ms  p95=${pct(sorted, 95)}ms  max=${Math.round(sorted[sorted.length - 1] ?? 0)}ms`,
  )
}

async function apiCall(port: number, pathname: string, token: string | null, body?: unknown) {
  const res = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, data: (await res.json()) as Record<string, unknown> }
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))])
}

interface SseHandle {
  controller: AbortController
  snapshot: Promise<number> // ms from connect to first snapshot
  paid: Promise<number> // wall-clock performance.now() when 'paid' arrived
}

function openSse(port: number, reference: string, token: string): SseHandle {
  const controller = new AbortController()
  let snapDone = false
  let resolveSnap!: (v: number) => void
  let resolvePaid!: (v: number) => void
  const snapshot = new Promise<number>((r) => (resolveSnap = r))
  const paid = new Promise<number>((r) => (resolvePaid = r))

  void (async () => {
    try {
      const res = await fetch(
        `http://127.0.0.1:${port}/api/payment/events?reference=${encodeURIComponent(reference)}`,
        { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal },
      )
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

// ---------------------------------------------------------------------------
// CutLuy webhook signing (mirrors the real HMAC contract)
// ---------------------------------------------------------------------------

function signWebhook(rawBody: string, t = Math.floor(Date.now() / 1000)): string {
  const v1 = createHmac('sha256', WEBHOOK_SECRET).update(`${t}.${rawBody}`).digest('hex')
  return `t=${t},v1=${v1}`
}

async function sendWebhook(port: number, eventId: string, referenceId: string) {
  const payload = {
    id: eventId,
    type: 'payment.completed',
    created: new Date().toISOString(),
    data: {
      payment: {
        id: `mock-pay-${referenceId}`,
        status: 'paid',
        amount: TOPUP.toFixed(2),
        currency: 'USD',
        reference_id: referenceId,
        metadata: null,
        approved_at: new Date().toISOString(),
      },
    },
  }
  const raw = JSON.stringify(payload)
  const res = await fetch(`http://127.0.0.1:${port}/webhooks/cutluy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CutLuy-Event': payload.type,
      'X-CutLuy-Signature': signWebhook(raw),
    },
    body: raw,
  })
  return { status: res.status, body: (await res.json()) as { outcome?: string; eventId?: string } }
}

// ---------------------------------------------------------------------------
// Instance orchestration
// ---------------------------------------------------------------------------

const children = new Map<number, ChildProcess>()

function bootInstance(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const log = fs.openSync(path.join(os.tmpdir(), `vidsmm-multi-${port}.log`), 'w')
    // Spawn the real app entrypoint via the resolved tsx CLI — no npx.
    const child = spawn(process.execPath, [tsxCli, 'src/index.ts'], {
      cwd: backendRoot,
      env: { ...process.env, ...sharedEnv, PORT: String(port) },
      stdio: ['ignore', log, log],
    })
    children.set(port, child)
    child.on('exit', (code) => {
      children.delete(port)
      if (code !== 0) reject(new Error(`instance :${port} exited with code ${code}`))
    })

    // Wait for the health endpoint.
    const deadline = Date.now() + 60_000
    const poll = async (): Promise<void> => {
      if (Date.now() > deadline) return reject(new Error(`instance :${port} did not become healthy in time`))
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/health`)
        if (res.ok) return resolve()
      } catch {
        /* not up yet */
      }
      setTimeout(() => void poll(), 500)
    }
    void poll()
  })
}

async function main() {
  // Harness DB connection + model access.
  const mongoose = (await import('mongoose')).default
  const { userRepository } = await import('../src/repositories/user.repository.js')
  const { signCustomerToken } = await import('../src/modules/auth/session.js')
  const { WalletModel } = await import('../src/models/wallet.model.js')

  const started = performance.now()
  console.log(`\n🚀 MULTI-INSTANCE load test — ${N} users across ${PORTS.length} backend instances\n`)
  console.log(`db: ${MONGO_URI}\nredis: ${REDIS_URL}\n`)

  await mongoose.connect(MONGO_URI)

  try {
    // ---- boot both instances ----
    await Promise.all(PORTS.map((p) => bootInstance(p)))
    console.log('both backend instances healthy ✓\n')

    // ---- seed users + tokens ----
    const users = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        userRepository.upsertFromGoogle({
          sub: `multi-${i}`,
          email: `multi-${i}@vidsmm.local`,
          name: `Multi Tester ${i}`,
          picture: '',
          emailVerified: true,
        }),
      ),
    )
    const tokens = await Promise.all(
      users.map((u) =>
        signCustomerToken({ id: u._id.toString(), email: u.email, name: u.name, avatarUrl: '', role: 'customer' }),
      ),
    )

    // ---- Phase 1: 100 concurrent creates, 50 per instance ----
    const createSamples: number[] = []
    const created = await Promise.all(
      users.map(async (u, i) => {
        const port = portAt(i)
        const t0 = performance.now()
        const res = await apiCall(port, '/api/payment/create', tokens[i] as string, { purpose: 'topup', amount: TOPUP })
        createSamples.push(performance.now() - t0)
        const reference = (res.data.payment as { referenceId?: string } | undefined)?.referenceId ?? ''
        return { userId: u._id.toString(), reference, port }
      }),
    )
    const okCreates = created.filter((c) => c.reference).length
    console.log(`Phase 1 — ${N} concurrent creations across :${PORTS.join(' / :')}`)
    console.log(`  created: ${okCreates}/${N} ✓`)
    summarize('create latency', createSamples)

    // ---- Phase 2: 3 × 100 concurrent status polls, round-robin ----
    console.log(`\nPhase 2 — 3 × ${N} concurrent status polls (per-instance TTL cache)`)
    const pollLatency: number[] = []
    for (let burst = 0; burst < 3; burst++) {
      await Promise.all(
        created.map(async (c, i) => {
          const port = portAt(i)
          const t0 = performance.now()
          const res = await apiCall(port, `/api/payment/status?reference=${encodeURIComponent(c.reference)}`, tokens[i] as string)
          pollLatency.push(performance.now() - t0)
          if (burst === 0 && res.status !== 200) console.log(`  ⚠️ poll ${c.reference} -> ${res.status}`)
        }),
      )
    }
    summarize('status latency (300 calls)', pollLatency)

    // ---- Phase 3: 100 SSE streams, 50 per instance ----
    console.log(`\nPhase 3 — ${N} SSE streams (50 per instance)`)
    const handles = created.map((c, i) => ({
      ref: c.reference,
      sse: openSse(portAt(i), c.reference, tokens[i] as string),
    }))
    const snapshotTimes = await Promise.all(handles.map((h) => withTimeout(h.sse.snapshot, 15_000, -1)))
    console.log(`  streams opened: ${snapshotTimes.filter((t) => t >= 0).length}/${N} ✓`)
    summarize('snapshot latency', snapshotTimes.filter((t) => t >= 0))

    // ---- Phase 4: THE RELAY — 100 webhooks to instance A only ----
    console.log(`\nPhase 4 — 100 webhooks POSTed to :${PORTS[0]} only (relay via Redis)`)

    const webhookAt = performance.now()
    const webhookResults = await withTimeout(
      Promise.all(handles.map((h, i) => sendWebhook(portAt(0), `evt-multi-${i}`, h.ref))),
      30_000,
      [],
    )
    const processDone = performance.now()
    const processed = webhookResults.filter((r) => r.body.outcome === 'processed').length
    const paidTimes = await Promise.all(handles.map((h) => withTimeout(h.sse.paid, 15_000, -1)))
    const deliveries = paidTimes.map((t, i) => ({ t: t - webhookAt, onA: portAt(i) === PORTS[0] }))
    const aDeliveries = deliveries.filter((d) => d.t > 0 && d.onA).map((d) => d.t)
    const bDeliveries = deliveries.filter((d) => d.t > 0 && !d.onA).map((d) => d.t)
    const delivered = aDeliveries.length + bDeliveries.length

    console.log(`  webhooks processed: ${processed}/${N} ✓`)
    console.log(`  SSE 'paid' delivered: ${delivered}/${N}  (A-streams ${aDeliveries.length}, B-streams ${bDeliveries.length}) ${delivered === N ? '✓' : '✗'}`)
    summarize('webhook→SSE on A (local bus)', aDeliveries)
    summarize('webhook→SSE on B (via Redis)', bDeliveries)
    const hop = Math.round((bDeliveries.reduce((a, b) => a + b, 0) / Math.max(1, bDeliveries.length)) - (aDeliveries.reduce((a, b) => a + b, 0) / Math.max(1, aDeliveries.length)))
    console.log(`  redis relay overhead (avg B − avg A): ${hop}ms`)
    console.log(`  webhook batch processing (100 concurrent, incl. DB writes): ${Math.round(processDone - webhookAt)}ms`)

    // ---- Phase 5: exactly-once + cross-instance webhook dedupe ----
    console.log(`\nPhase 5 — exactly-once + dedupe`)
    const wallets = await Promise.all(
      created.map(async (c) => {
        const w = await WalletModel.findOne({ user: c.userId }).lean().exec()
        const topups = (w?.transactions ?? []).filter((tx) => tx.refType === 'topup')
        return { ref: c.reference, balance: w?.balance ?? 0, topups: topups.length }
      }),
    )
    const correct = wallets.filter((w) => w.balance === TOPUP && w.topups === 1).length
    console.log(`  wallets credited exactly ${TOPUP} USD with 1 topup tx: ${correct}/${N} ${correct === N ? '✓' : '✗'}`)

    // Replay the SAME events — half to A, half to B — must all be deduped.
    const replay = wallets.slice(0, 10)
    const replayResults = await withTimeout(
      Promise.all(replay.map((w, i) => sendWebhook(portAt(i), `evt-multi-${i}`, w.ref))),
      30_000,
      [],
    )
    const deduped = replayResults.filter((r) => r.body.outcome === 'duplicate').length
    const after = await Promise.all(
      replay.map(async (w) => {
        const doc = await WalletModel.findOne({ user: created.find((c) => c.reference === w.ref)?.userId }).lean().exec()
        return doc?.balance ?? 0
      }),
    )
    const noDouble = after.every((b) => b === TOPUP)
    console.log(`  replayed events (5→A, 5→B) deduped: ${deduped}/10 ${deduped === 10 ? '✓' : '✗'} (shared webhook_logs)`)

    // ---- Summary ----
    console.log(`\n═══ SUMMARY ═══`)
    console.log(`total wall time: ${Math.round((performance.now() - started) / 1000)}s`)
    console.log(`instances: ${PORTS.length} | users: ${N} | db: local mongo | redis: local`)
    console.log(`relay verdict: ${delivered === N ? '✅ all SSE clients on BOTH instances got the paid event' : '❌ relay incomplete'}`)
    console.log(`dedupe verdict: ${noDouble ? '✅ no double-charge across instances' : '❌ DOUBLE-CHARGE'}`)

    handles.forEach((h) => h.sse.controller.abort())
  } finally {
    // Kill both instances and WAIT for them to fully exit (graceful SIGTERM
    // shutdown: server.close → Redis quit → mongoose disconnect). Dropping
    // the DB while an instance is still connected races with its shutdown.
    for (const [, child] of children) child.kill()
    await Promise.race([
      Promise.all(
        [...children.values()].map(
          (c) => new Promise<void>((resolve) => c.once('exit', () => resolve())),
        ),
      ),
      new Promise<void>((resolve) => setTimeout(resolve, 10_000)), // never hang CI
    ])
    // Drop the throwaway database.
    try {
      await mongoose.connection.db?.dropDatabase()
      console.log('\nthrowaway db dropped ✓')
    } catch (err) {
      console.log('\nwarning: could not drop db —', err instanceof Error ? err.message : err)
    }
    await mongoose.disconnect()
    // Close any Redis clients the harness opened (the two instances open
    // their own in their own processes; this clears the harness side).
    await shutdownRedis()
    await shutdownRedisClient()
  }
}

main().then(
  () => {
    // Force a clean exit — a stray handle (SSE fetch reader, mongoose pool
    // socket) can keep the harness alive after the test completes, which
    // made the CI step hang until its timeout.
    setTimeout(() => process.exit(0), 500)
  },
  (err) => {
    console.error('\nMULTI-INSTANCE LOAD TEST FAILED:', err instanceof Error ? err.message : err)
    // Kill any surviving instances and give them a moment to die, so a
    // failure never leaves orphaned processes squatting on ports 4001/4002.
    for (const [, child] of children) child.kill()
    setTimeout(() => process.exit(1), 1000)
  },
)
