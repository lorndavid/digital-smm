import { Router } from 'express'
import express from 'express'
import { handleCutLuyWebhook, webhookHttpStatus } from '../modules/payment/providers/cutluy/webhook.service.js'
import { asyncHandler } from '../utils/async-handler.js'

/**
 * Provider webhook endpoints.
 *
 * These MUST be mounted before the global `express.json()` middleware in
 * app.ts — signature verification requires the RAW request body.
 */
export const webhookRoutes = Router()

webhookRoutes.post(
  '/cutluy',
  express.raw({ type: 'application/json' }),
  asyncHandler(async (req, res) => {
    const result = await handleCutLuyWebhook(req.body as Buffer, req.headers)
    res.status(webhookHttpStatus(result)).json(result)
  }),
)
