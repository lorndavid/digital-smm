import { Router } from 'express'
import { profileController } from '../controllers/profile.controller.js'
import { authenticated } from '../middleware/auth.middleware.js'

export const profileRoutes = Router()

// Scope the auth middleware to this router's own paths.
profileRoutes.use('/profile', authenticated)

profileRoutes.get('/profile', profileController.get)
profileRoutes.patch('/profile', ...profileController.update)
profileRoutes.get('/profile/favorites', profileController.getFavorites)
profileRoutes.put('/profile/favorites', ...profileController.setFavorites)
profileRoutes.get('/profile/favorites/services', profileController.getFavoriteServices)
profileRoutes.put('/profile/favorites/services', ...profileController.setFavoriteServices)
