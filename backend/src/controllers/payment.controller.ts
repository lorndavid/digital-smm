import { paymentService } from '../services/payment.service.js'
import { subscribePaymentStatus } from '../services/payment/events.bus.js'
import { asyncHandler } from '../utils/async-handler.js'
import { validate, validateQuery } from '../middleware/validate.middleware.js'
import {
  cancelPaymentBodySchema,
  createPaymentBodySchema,
  paginationQuerySchema,
  paymentStatusQuerySchema,
  retryPaymentBodySchema,
  verifyPaymentBodySchema,
} from '../validators/index.js'

export const paymentController = {
  /**
   * Creates a local order (status 'Pending Payment') for order purposes,
   * then a pending payment and calls the provider for the QR / checkout.
   */
  create: [
    validate(createPaymentBodySchema),
    asyncHandler(async (req, res) => {
      const { payment, order } = await paymentService.createPayment(req.userId as string, req.body)
      res.status(201).json({ payment, order })
    }),
  ],

  /** Lightweight status read (payment page initial load + polling). */
  status: [
    validateQuery(paymentStatusQuerySchema),
    asyncHandler(async (req, res) => {
      const q = req.validatedQuery as { reference: string }
      res.json(await paymentService.status(req.userId as string, q.reference))
    }),
  ],

  /** Forces a provider check; fulfils (wallet credit / order) when paid. */
  verify: [
    validate(verifyPaymentBodySchema),
    asyncHandler(async (req, res) => {
      res.json(await paymentService.verify(req.userId as string, req.body.reference))
    }),
  ],

  /** Cancels a pending payment (and its pending order). */
  cancel: [
    validate(cancelPaymentBodySchema),
    asyncHandler(async (req, res) => {
      res.json(await paymentService.cancel(req.userId as string, req.body.reference))
    }),
  ],

  /** Generates a fresh QR for an existing pending order. */
  retry: [
    validate(retryPaymentBodySchema),
    asyncHandler(async (req, res) => {
      res.json(await paymentService.retry(req.userId as string, req.body.orderId))
    }),
  ],

  history: [
    validateQuery(paginationQuerySchema),
    asyncHandler(async (req, res) => {
      const q = req.validatedQuery ?? {}
      res.json(
        await paymentService.paymentsForUser(
          req.userId as string,
          (q.page as number) ?? 1,
          (q.limit as number) ?? 20,
        ),
      )
    }),
  ],

  /**
   * Server-Sent Events stream for a payment reference. The client connects
   * with a fetch() so the Authorization header is sent; falls back to
   * 5s polling automatically on the client if this stream fails.
   */
  events: [
    validateQuery(paymentStatusQuerySchema),
    asyncHandler(async (req, res) => {
      const q = req.validatedQuery as { reference: string }
      const referenceId = q.reference

      // Ownership check FIRST — only the payment's owner may subscribe, so
      // a guessed reference never leaks another user's status events.
      const snapshot = await paymentService.status(req.userId as string, referenceId)

      res.status(200)
      res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      })
      res.flushHeaders?.()

      const send = (data: unknown): void => {
        res.write(`data: ${JSON.stringify(data)}\n\n`)
      }

      // Push the current snapshot immediately so late connectors sync up.
      send(snapshot)

      const unsubscribe = subscribePaymentStatus(referenceId, (payload) => {
        send(payload)
        // Terminal states close the stream — the client shows the result.
        if (['paid', 'expired', 'failed', 'refunded'].includes(payload.status)) {
          res.end()
        }
      })

      const heartbeat = setInterval(() => res.write(': ping\n\n'), 20_000)
      const cleanup = (): void => {
        clearInterval(heartbeat)
        unsubscribe()
      }
      req.on('close', cleanup)
      res.on('close', cleanup)
    }),
  ],
}
