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
    const users = mongoose.connection.collection('users')
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

/**
 * Establishes the MongoDB Atlas connection and wires up connection
 * lifecycle logging.
 */
export async function connectDatabase(): Promise<void> {
  mongoose.connection.on('connected', () => logger.info('[db] MongoDB Atlas connected'))
  mongoose.connection.on('error', (err) => logger.error('[db] MongoDB connection error', err))
  mongoose.connection.on('disconnected', () => logger.warn('[db] MongoDB disconnected'))

  await mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 10,
  })

  // Keep new Google sign-ups working even on databases migrated from Clerk
  // (see dropLegacyClerkUserIndexes above). Idempotent — one cheap
  // listIndexes call per boot.
  await dropLegacyClerkUserIndexes()
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect()
}

/** @returns true when a mongoose connection is currently open. */
export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1
}
