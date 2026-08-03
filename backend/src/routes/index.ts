import { Router } from 'express'
import { healthRoutes } from './health.routes.js'
import { catalogRoutes } from './catalog.routes.js'
import { orderRoutes } from './order.routes.js'
import { paymentRoutes } from './payment.routes.js'
import { profileRoutes } from './profile.routes.js'
import { adminRoutes } from './admin.routes.js'

export const apiRoutes = Router()

apiRoutes.use(healthRoutes)
apiRoutes.use(catalogRoutes)
apiRoutes.use(orderRoutes)
apiRoutes.use(paymentRoutes)
apiRoutes.use(profileRoutes)
apiRoutes.use(adminRoutes)
