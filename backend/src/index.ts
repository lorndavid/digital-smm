import { createApp } from './app.js'
import { env } from './config/env.js'
import { connectDatabase, disconnectDatabase } from './config/database.js'
import { startOrderSyncJob, stopOrderSyncJob } from './jobs/order-sync.job.js'
import { shutdownRedis } from './services/payment/events.bus.js'
import { shutdownRedisClient } from './services/redis/redis.client.js'
import { seedSuperAdmin } from './services/admin-auth.service.js'
import { logger } from './utils/logger.js'

async function bootstrap(): Promise<void> {
  await connectDatabase()
  await seedSuperAdmin()

  // Confirm Google OAuth or warn.
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    logger.info(
      `[auth] Google OAuth configured — client ID: ${env.GOOGLE_CLIENT_ID.slice(0, 16)}… | redirect URI: ${env.FRONTEND_URL.replace(/\/$/, '')}/auth/callback`,
    )
  } else {
    logger.warn('[auth] Google OAuth not configured — customer sign-in will show "not configured" message')
  }

  const app = createApp()
  const server = app.listen(env.PORT, () => {
    logger.info(`[server] VidSMM backend listening on http://localhost:${env.PORT}`)
  })

  startOrderSyncJob()

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`[server] Received ${signal}, shutting down...`)
    stopOrderSyncJob()
    server.close()
    await shutdownRedis() // SSE bus pub/sub clients
    await shutdownRedisClient() // distributed rate limiter client
    await disconnectDatabase()
    process.exit(0)
  }

  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
}

bootstrap().catch((err) => {
  logger.error('[server] Failed to start', err)
  process.exit(1)
})
