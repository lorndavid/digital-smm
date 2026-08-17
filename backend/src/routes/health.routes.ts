import { Router } from 'express'
import { healthController } from '../controllers/health.controller.js'

export const healthRoutes = Router()

healthRoutes.get('/health', healthController.check)
healthRoutes.get('/check', healthController.check)
healthRoutes.get('/', healthController.check)
