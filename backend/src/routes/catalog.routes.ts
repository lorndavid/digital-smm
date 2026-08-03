import { Router } from 'express'
import { catalogController } from '../controllers/catalog.controller.js'

export const catalogRoutes = Router()

catalogRoutes.get('/services', ...catalogController.getServices)
catalogRoutes.get('/categories', catalogController.getCategories)
catalogRoutes.get('/announcements', catalogController.getAnnouncements)
