import { Router } from 'express'
import { catalogueLimiter } from '../middleware/rate-limit.middleware.js'
import { catalogController } from '../controllers/catalog.controller.js'

export const catalogRoutes = Router()

// Public storefront reads get a generous dedicated quota (catalogueLimiter)
// so browsing is never throttled by the stricter global budget.
catalogRoutes.get('/services', catalogueLimiter, ...catalogController.getServices)
catalogRoutes.get('/categories', catalogueLimiter, catalogController.getCategories)
catalogRoutes.get('/announcements', catalogueLimiter, catalogController.getAnnouncements)
