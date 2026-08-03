import { isDatabaseConnected } from '../config/database.js'
import { asyncHandler } from '../utils/async-handler.js'

export const healthController = {
  check: asyncHandler(async (_req, res) => {
    res.json({
      status: 'ok',
      service: 'vidsmm-backend',
      db: isDatabaseConnected() ? 'connected' : 'disconnected',
      time: new Date().toISOString(),
    })
  }),
}
