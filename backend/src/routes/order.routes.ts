import { Router } from 'express'
import { orderController } from '../controllers/order.controller.js'
import { authenticated } from '../middleware/auth.middleware.js'
import { checkoutLimiter } from '../middleware/rate-limit.middleware.js'

export const orderRoutes = Router()

// Scope the auth middleware to this router's own paths so it does not
// bleed onto unrelated /api requests (e.g. unmatched routes must 404).
orderRoutes.use('/orders', authenticated)

orderRoutes.post('/orders', checkoutLimiter, ...orderController.create)
orderRoutes.get('/orders', ...orderController.list)
// MUST be declared before '/orders/:id' so 'events' is not captured as an id.
orderRoutes.get('/orders/events', ...orderController.events)
orderRoutes.get('/orders/:id', orderController.getOne)
orderRoutes.post('/orders/:id/cancel', orderController.cancel)
orderRoutes.post('/orders/:id/refill', orderController.refill)
