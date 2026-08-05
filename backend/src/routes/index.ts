import { Router } from 'express'
import { env } from '../config/env.js'
import { apiLimiter } from '../middleware/rate-limit.middleware.js'
import { healthRoutes } from './health.routes.js'
import { authRoutes } from '../modules/auth/auth.routes.js'
import { catalogRoutes } from './catalog.routes.js'
import { orderRoutes } from './order.routes.js'
import { paymentRoutes } from './payment.routes.js'
import { profileRoutes } from './profile.routes.js'
import { adminRoutes } from './admin.routes.js'
import { devRoutes } from './dev.routes.js'

export const apiRoutes = Router()

// Auth routes bypass the global limiter so the OAuth redirect flow
// (Google → callback → exchange) is never throttled.
apiRoutes.use(authRoutes)

// Every other /api/* route rate-limited.
apiRoutes.use(apiLimiter)

apiRoutes.use(healthRoutes)
apiRoutes.use(catalogRoutes)
apiRoutes.use(orderRoutes)
apiRoutes.use(paymentRoutes)
apiRoutes.use(profileRoutes)
apiRoutes.use(adminRoutes)

// Test-only helpers for browser/E2E tests (see dev.routes.ts). Mounted only
// in non-production with the mock payment provider so they can never create
// real charges or leak in a live deployment.
if (env.NODE_ENV !== 'production' && env.PAYMENT_PROVIDER === 'mock') {
  apiRoutes.use(devRoutes)
}
