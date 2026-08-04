/**
 * One-off migration: drop the stale legacy `clerkId_1` unique index from the
 * `users` collection.
 *
 * Why this exists:
 *   The app previously used Clerk, whose user model stored the Clerk user id
 *   in a `clerkId` field with a UNIQUE index. After migrating to Google OAuth
 *   the schema no longer has `clerkId`, so every new Google user is indexed
 *   as `clerkId: null`. MongoDB's unique index permits only ONE document with
 *   a missing field — so the first Google sign-in succeeds but every later
 *   sign-up fails with a duplicate-key error (HTTP 409) and the user cannot
 *   log in. Dropping the stale index fixes sign-ups for all users.
 *
 * The app also performs this drop automatically on boot (config/database.ts
 * → dropLegacyClerkUserIndexes), so running this script is optional — it
 * exists for one-off manual runs and for environments where the backend isn't
 * restarted.
 *
 * Usage (from backend/):  npm run migrate:drop-clerk-index
 */
import 'dotenv/config'
import { connectDatabase, disconnectDatabase, dropLegacyClerkUserIndexes } from '../src/config/database.js'
import { logger } from '../src/utils/logger.js'

async function main(): Promise<void> {
  await connectDatabase()
  // Idempotent — shared with the boot-time cleanup, so this is a no-op when
  // the index is already gone.
  await dropLegacyClerkUserIndexes()
  logger.info(
    '[migrate-drop-clerk-index] Done. All Google users can now sign up without duplicate-key (409) errors.',
  )
  await disconnectDatabase()
}

main().catch((err) => {
  logger.error('[migrate-drop-clerk-index] Failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
