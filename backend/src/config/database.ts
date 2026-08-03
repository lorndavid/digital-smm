import mongoose from 'mongoose'
import { env } from './env.js'
import { logger } from '../utils/logger.js'

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
