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
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect()
}

/** @returns true when a mongoose connection is currently open. */
export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1
}
