/**
 * One-time cleanup: drops every leaked `digitalsmm_browsertest_*` database.
 *
 * The e2e suite creates a throwaway DB per run and drops it on graceful
 * shutdown; abruptly-killed runs leak them, and free Atlas clusters cap at
 * 500 collections. Run once to reclaim the quota:
 *   npx tsx scripts/_cleanup-test-dbs.ts
 * Safe: only touches databases whose name starts with digitalsmm_browsertest_.
 */
import mongoose from 'mongoose'
import { setServers } from 'node:dns'

async function main(): Promise<void> {
  await import('dotenv/config')
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI missing from backend/.env')
    process.exit(1)
  }
  // Some ISPs/local DNS fail to resolve Atlas SRV records — use public DNS.
  setServers(['1.1.1.1', '8.8.8.8'])
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20000 })
  const adminDb = mongoose.connection.getClient().db().admin()
  const { databases } = await adminDb.listDatabases()

  const targets = (databases as Array<{ name: string }>)
    .map((d) => d.name)
    // Browsertest + loadtest suites both use throwaway databases.
    .filter((name) => name.startsWith('digitalsmm_browsertest_') || name.startsWith('digitalsmm_loadtest_'))

  if (targets.length === 0) {
    console.log('No stale digitalsmm test databases found.')
  }
  // Drop BY NAME via the driver's Db handle. NEVER use
  // connection.dropDatabase() here — it ignores the argument and drops the
  // CONNECTED (app) database. client.db(name).dropDatabase() targets only
  // the named database.
  const client = mongoose.connection.getClient()
  for (const name of targets) {
    await client.db(name).dropDatabase()
    console.log(`dropped ${name}`)
  }

  // Report the namespace usage after cleanup so we can confirm we're under
  // the free-tier 500-collection cap.
  const after = await adminDb.listDatabases()
  const collectionTotal = (after.databases as Array<{ name: string; sizeOnDisk: number }>).reduce(
    (acc, db) => acc + (db.sizeOnDisk > 0 ? 1 : 0),
    0,
  )
  const dbCount = (after.databases as Array<{ name: string }>).length
  console.log(`remaining databases: ${dbCount}`)
  await mongoose.disconnect()
}

main().catch((err) => {
  console.error('cleanup failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
