import { Router } from 'express'
import { authController } from './auth.controller.js'

export const authRoutes = Router()

// Public (rate-limited via the /api limiter in app.ts).
authRoutes.post('/auth/google/url', ...authController.googleUrl)
authRoutes.post('/auth/google/exchange', ...authController.exchange)

// Authenticated.
authRoutes.get('/auth/me', ...authController.me)
authRoutes.post('/auth/logout', ...authController.logout)
