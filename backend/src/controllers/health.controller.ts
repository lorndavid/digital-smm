import { isDatabaseConnected } from '../config/database.js'
import { env } from '../config/env.js'
import { asyncHandler } from '../utils/async-handler.js'

export const healthController = {
  check: asyncHandler(async (_req, res) => {
    res.json({
      status: 'ok',
      service: 'digitalsmm-backend',
      db: isDatabaseConnected() ? 'connected' : 'disconnected',
      smmProvider: env.SMM_PROVIDER,
      paymentProvider: env.PAYMENT_PROVIDER,
      time: new Date().toISOString(),
    })
  }),
}
