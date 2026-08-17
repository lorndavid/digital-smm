import { Router } from 'express'
import { healthController } from '../controllers/health.controller.js'

export const healthRoutes = Router()

// Liveness (process up) — compatible with the pre-existing /api/health.
healthRoutes.get('/health', healthController.check)
healthRoutes.get('/health/check', healthController.check)
healthRoutes.get('/health/deps', healthController.deps)
healthRoutes.get('/health/metrics', healthController.metrics)
// Readiness (dependencies reachable) — for orchestrators / load balancers.
healthRoutes.get('/ready', healthController.ready)
// Compatibility: bare /api/health? is handled above; root of the API too.
healthRoutes.get('/', healthController.check)
