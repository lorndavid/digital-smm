import mongoose from 'mongoose'
import { logger } from './logger.js'

/**
 * Minimal distributed lock backed by MongoDB.
 *
 * Used so a scheduled job (e.g. the daily report) runs exactly once even
 * when multiple backend replicas are running. Mutual exclusion is enforced
 * by a UNIQUE index on `name` + insert-or-nothing semantics:
 *
 *   1. delete expired locks for this name
 *   2. insertOne({ name, owner, expiresAt }) — only one replica wins, the
 *      others get a duplicate-key error and return false.
 *
 * Locks self-expire (expiresAt) so a crashed holder never blocks forever.
 * This is NOT a bulletproof distributed lock (no fencing tokens), but it is
 * more than sufficient for a daily report — the failure mode is a duplicate
 * report at worst, never a data-safety issue.
 */

let uniqueIndexEnsured = false

async function ensureIndex(): Promise<void> {
  if (uniqueIndexEnsured) return
  const db = mongoose.connection.db
  if (!db) return
  await db.collection('locks').createIndex({ name: 1 }, { unique: true })
  uniqueIndexEnsured = true
}

/**
 * Attempts to acquire `name` for `ttlMs`. Returns true only when this
 * caller won. Never throws.
 */
export async function tryAcquireLock(name: string, ttlMs: number, owner: string): Promise<boolean> {
  try {
    if (mongoose.connection.readyState !== 1) return false
    await ensureIndex()
    const col = mongoose.connection.db!.collection('locks')
    const now = new Date()
    await col.deleteMany({ name, expiresAt: { $lte: now } })
    const result = await col.insertOne({
      name,
      owner,
      acquiredAt: now,
      expiresAt: new Date(now.getTime() + ttlMs),
    })
    return Boolean(result.insertedId)
  } catch (err) {
    // Duplicate key = someone else holds the lock. Everything else is logged
    // and treated as "not acquired" so the job safely skips.
    const message = err instanceof Error ? err.message : String(err)
    if (!/E11000|duplicate key/i.test(message)) {
      logger.warn('[lock] failed to acquire lock', { name, error: message })
    }
    return false
  }
}

/** Releases a lock owned by this caller. Best-effort, never throws. */
export async function releaseLock(name: string, owner: string): Promise<void> {
  try {
    if (mongoose.connection.readyState !== 1) return
    await mongoose.connection.db!.collection('locks').deleteMany({ name, owner })
  } catch {
    /* best-effort */
  }
}
