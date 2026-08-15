import dns from 'node:dns'
import mongoose from 'mongoose'
import { env } from './env.js'
import { logger } from '../utils/logger.js'

// Pin Node's resolver to explicit DNS servers when configured, BEFORE any
// mongoose connection attempt. Fixes `querySrv ECONNREFUSED` on Windows/ISP
// networks where c-ares fails SRV lookups even though the OS resolver
// (nslookup) works fine. Centralised here so the app AND every script that
// calls connectDatabase() get the same behaviour.
if (env.DNS_SERVERS.length > 0) {
  dns.setServers(env.DNS_SERVERS)
  logger.info(`[dns] Using explicit DNS servers: ${env.DNS_SERVERS.join(', ')}`)
}

/**
 * Drops a legacy `clerkId_*` unique index from the `users` collection when
 * present. Safe to run on every boot (or from one-off migration scripts):
 * listIndexes + dropIndex are idempotent, and if the index is already gone
 * this is a no-op. Failures are logged and swallowed so a stale index can
 * never take the app down.
 *
 * Why this exists:
 *   The app previously used Clerk, whose user model stored the Clerk user id
 *   in a `clerkId` field with a UNIQUE index. After migrating to Google OAuth
 *   the schema no longer has `clerkId`, so every new Google user is indexed
 *   as `clerkId: null`. MongoDB's unique index permits only ONE document with
 *   a missing field — so the first Google sign-in succeeds but every later
 *   sign-up fails with a duplicate-key error (HTTP 409) and the user cannot
 *   log in. Dropping the stale index fixes sign-ups for all users.
 */
export async function dropLegacyClerkUserIndexes(): Promise<void> {
  try {
    const db = mongoose.connection.db
    if (!db) return
    // On a fresh database (e.g. the throwaway browser-test DB) the users
    // collection may not exist yet — listing its indexes would throw
    // NamespaceNotFound (code 26) and spam the log with a stack trace.
    // There is nothing to migrate in that case, so skip quietly.
    const exists = await db.listCollections({ name: 'users' }, { nameOnly: true }).hasNext()
    if (!exists) return
    const users = db.collection('users')
    const indexes = await users.indexes()
    const stale = indexes.find((i) => i.name === 'clerkId_1' || (i.key && 'clerkId' in i.key))
    if (stale && stale.name) {
      await users.dropIndex(stale.name)
      logger.warn(
        `[db] Dropped stale legacy index "${stale.name}" from users (Clerk-era) — ` +
          'it was blocking new Google sign-ups with duplicate-key 409 errors.',
      )
    }
  } catch (err) {
    // Non-fatal: the app still boots; the index can be dropped later.
    logger.warn('[db] Could not inspect/drop legacy user indexes', err)
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let memoryServer: any = null

/**
 * Establishes the MongoDB connection with automatic in-memory fallback
 * when local or remote MongoDB is unreachable.
 */
export async function connectDatabase(): Promise<void> {
  let initialAttemptComplete = false

  mongoose.connection.on('connected', () => logger.info('[db] MongoDB connected'))
  mongoose.connection.on('error', (err) => {
    if (!initialAttemptComplete) return
    logger.error('[db] MongoDB connection error', err)
  })
  mongoose.connection.on('disconnected', () => logger.warn('[db] MongoDB disconnected'))

  try {
    await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 2000,
      maxPoolSize: 10,
    })
    initialAttemptComplete = true
  } catch (err) {
    logger.warn(
      `[db] Could not connect to primary MONGODB_URI (${env.MONGODB_URI}). ` +
        'Starting zero-config in-memory MongoDB server...',
    )
    try {
      const { MongoMemoryServer } = await import('mongodb-memory-server')
      memoryServer = await MongoMemoryServer.create({
        instance: { dbName: 'digitalsmm' },
      })
      const uri = memoryServer.getUri()
      await mongoose.connect(uri, {
        maxPoolSize: 10,
      })
      initialAttemptComplete = true
      logger.info('[db] Connected to zero-config in-memory MongoDB server! No Docker or external DB required.')
    } catch (fallbackErr) {
      logger.error('[db] Failed to start in-memory MongoDB fallback', fallbackErr)
      throw err
    }
  }

  // Keep new Google sign-ups working even on databases migrated from Clerk
  // (see dropLegacyClerkUserIndexes above). Idempotent — one cheap
  // listIndexes call per boot.
  await dropLegacyClerkUserIndexes()
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect()
  if (memoryServer) {
    await memoryServer.stop()
    memoryServer = null
  }
}

/** @returns true when a mongoose connection is currently open. */
export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1
}
