import 'dotenv/config'
import { connectDatabase, disconnectDatabase } from '../src/config/database.js'
import { runOrderSync } from '../src/jobs/order-sync.job.js'
import { logger } from '../src/utils/logger.js'

async function main(): Promise<void> {
  await connectDatabase()
  logger.info('[order-sync] Starting manual order sync...')
  await runOrderSync()
  logger.info('[order-sync] Order status sync completed!')
  await disconnectDatabase()
}

main().catch((err) => {
  logger.error('[order-sync] Error during sync:', err)
  process.exit(1)
})
