import { Router } from 'express'
import { profileController } from '../controllers/profile.controller.js'
import { authenticated } from '../middleware/auth.middleware.js'

export const profileRoutes = Router()

// Scope the auth middleware to this router's own paths.
profileRoutes.use('/profile', authenticated)

profileRoutes.get('/profile', profileController.get)
profileRoutes.patch('/profile', ...profileController.update)
