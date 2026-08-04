import { Router } from 'express'
import { apiLimiter } from '../middleware/rate-limit.middleware.js'
import { healthRoutes } from './health.routes.js'
import { authRoutes } from '../modules/auth/auth.routes.js'
import { catalogRoutes } from './catalog.routes.js'
import { orderRoutes } from './order.routes.js'
import { paymentRoutes } from './payment.routes.js'
import { profileRoutes } from './profile.routes.js'
import { adminRoutes } from './admin.routes.js'

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
