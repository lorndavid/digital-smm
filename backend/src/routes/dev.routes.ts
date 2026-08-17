import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { env } from '../config/env.js'
import { asyncHandler } from '../utils/async-handler.js'
import { userRepository } from '../repositories/user.repository.js'
import { signCustomerToken } from '../modules/auth/session.js'
import { paymentService } from '../services/payment.service.js'

/**
 * Test-only routes for browser/E2E tests.
 *
 * Mounted in routes/index.ts ONLY when BOTH hold:
 *   - NODE_ENV !== 'production'  → never ships to a live server
 *   - PAYMENT_PROVIDER === 'mock' → can never create real CutLuy charges
 *
 * POST /api/dev/test-bootstrap
 *   Creates a throwaway Google-style customer, signs a customer session JWT,
 *   and opens a KHQR top-up payment through the mock provider (a real QR
 *   image). Returns everything the Playwright test needs to drive the real
 *   payment page end-to-end without Google OAuth:
 *     { token, payment, webhookSecret }
 *   `webhookSecret` mirrors CUTLUY_WEBHOOK_SECRET so the test can sign a
 *   genuine CutLuy webhook request (self-syncing — never duplicated).
 */
export const devRoutes = Router()

devRoutes.post(
  '/dev/test-bootstrap',
  asyncHandler(async (_req, res) => {
    const email = `e2e-${randomUUID().slice(0, 8)}@digitalsmm.local`
    const user = await userRepository.upsertFromGoogle({
      sub: `e2e-${randomUUID()}`,
      email,
      name: 'E2E Browser Tester',
      picture: '',
      emailVerified: true,
    })
    const token = await signCustomerToken({
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      role: 'customer',
    })
    const { payment } = await paymentService.createPayment(user._id.toString(), {
      purpose: 'topup',
      amount: 5,
    })
    res.status(201).json({
      token,
      payment,
      webhookSecret: env.CUTLUY_WEBHOOK_SECRET ?? '',
    })
  }),
)

devRoutes.post(
  '/dev/delete-service',
  asyncHandler(async (req, res) => {
    const { serviceId } = req.body as { serviceId?: string }
    if (!serviceId) {
      res.status(400).json({ error: 'serviceId is required' })
      return
    }
    const { ServiceModel } = await import('../models/service.model.js')
    const result = await ServiceModel.deleteOne({ _id: serviceId }).exec()
    res.json({ deletedCount: result.deletedCount })
  }),
)
