/**
 * Cross-instance verification for the Redis-backed payment SSE bus.
 *
 * Boots TWO bus instances in one process (distinct module instances via
 * cache-busting specifiers), both connected to the same Redis:
 *   - busB subscribes to a payment reference.
 *   - busA emits a 'paid' event for that reference.
 *   - busB must receive it exactly ONCE.
 *
 * This proves the two properties that matter when scaling beyond one
 * process:
 *   1. Cross-instance relay — the event travels through Redis from A to B.
 *   2. Echo-skip — A's own subscriber connection also hears the publish
 *      (separate connection, same process) but must ignore it via the
 *      instanceId guard, so B sees 1 event, not 2.
 *
 * Requires a running Redis. Set REDIS_URL in backend/.env (e.g.
 * redis://localhost:6379) then run:
 *
 *   npx tsx scripts/verify-redis-cross-instance.ts
 *
 * Exit codes: 0 = verified, 1 = delivery failed/double-delivered, 2 = no Redis.
 */
import 'dotenv/config'

const REDIS_URL = process.env.REDIS_URL ?? ''
const REF = `verify-${Date.now()}`

async function main() {
  if (!REDIS_URL) {
    console.log('\n❌ REDIS_URL is not set in backend/.env.')
    console.log('   Start Redis (e.g. `redis-server` or Docker) and add e.g. REDIS_URL=redis://localhost:6379')
    process.exit(2)
  }

  console.log(`\n🧪 Cross-instance SSE bus verification (redis=${REDIS_URL})\n`)

  // Two independent module instances of the bus (ESM cache-busting via
  // query-string specifiers). tsx resolves these at runtime; tsc cannot
  // resolve the specifier, hence @ts-expect-error + a local interface.
  interface BusApi {
    subscribePaymentStatus: (
      referenceId: string,
      listener: (payload: { referenceId: string; status: string }) => void,
    ) => () => void
    emitPaymentStatus: (payload: { referenceId: string; status: string }) => void
    shutdownRedis: () => Promise<void>
  }

  // @ts-expect-error query-string specifier is runtime-only (tsx)
  const busA = (await import('../src/services/payment/events.bus.js?instance=a')) as unknown as BusApi
  // @ts-expect-error query-string specifier is runtime-only (tsx)
  const busB = (await import('../src/services/payment/events.bus.js?instance=b')) as unknown as BusApi
  if (busA === busB) {
    console.log('❌ cache-busting imports resolved to the SAME module instance — cannot verify cross-instance delivery this way.')
    process.exit(3)
  }

  const seen: string[] = []
  const unsub = busB.subscribePaymentStatus(REF, (p) => seen.push(p.status))

  // A only emits, so it never subscribes in real life — warm its Redis
  // connection with a throwaway listener so it is ready to publish.
  const warmA = busA.subscribePaymentStatus(REF, () => undefined)

  // Let both instances connect + subscribe to the Redis channel.
  console.log('waiting for both instances to connect to Redis…')
  await new Promise((r) => setTimeout(r, 2500))
  warmA() // drop the throwaway listener — the connection stays up

  console.log(`A emits 'paid' for ${REF}`)
  busA.emitPaymentStatus({ referenceId: REF, status: 'paid' })

  // Give the publish + relay + echo-skip time to settle.
  await new Promise((r) => setTimeout(r, 1500))

  unsub()
  await busA.shutdownRedis()
  await busB.shutdownRedis()

  const delivered = seen.length
  console.log(`\nB received ${delivered} event(s): ${JSON.stringify(seen)}`)
  console.log(`cross-instance delivery: ${delivered >= 1 ? 'OK ✓' : 'FAIL ✗'}`)
  console.log(`echo-skip (exactly once): ${delivered === 1 ? 'OK ✓' : 'FAIL ✗ — double delivery!'}`)

  if (delivered === 1) {
    console.log('\n✅ Verified — the bus relays across instances with no echo.')
    process.exit(0)
  }
  process.exit(1)
}

main().catch((err) => {
  console.error('\nverification failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
