import { Router } from 'express'
import { paymentController } from '../controllers/payment.controller.js'
import { authenticated } from '../middleware/auth.middleware.js'
import { checkoutLimiter } from '../middleware/rate-limit.middleware.js'

export const paymentRoutes = Router()

// Scope the auth middleware to this router's own paths.
paymentRoutes.use('/payment', authenticated)

paymentRoutes.post('/payment/create', checkoutLimiter, ...paymentController.create)
paymentRoutes.get('/payment/status', ...paymentController.status)
paymentRoutes.post('/payment/verify', checkoutLimiter, ...paymentController.verify)
paymentRoutes.post('/payment/cancel', ...paymentController.cancel)
paymentRoutes.post('/payment/retry', ...paymentController.retry)
paymentRoutes.get('/payment/history', ...paymentController.history)
paymentRoutes.get('/payment/events', ...paymentController.events)
