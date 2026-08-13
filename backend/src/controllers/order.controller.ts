import { orderService } from '../services/order.service.js'
import { subscribeOrderStatus } from '../services/order/events.bus.js'
import { asyncHandler } from '../utils/async-handler.js'
import { validate, validateQuery } from '../middleware/validate.middleware.js'
import { paginationQuerySchema, createOrderBodySchema } from '../validators/index.js'

export const orderController = {
  /** Wallet-funded order placement. */
  create: [
    validate(createOrderBodySchema),
    asyncHandler(async (req, res) => {
      const order = await orderService.createOrderFromWallet(req.userId as string, req.body)
      res.status(201).json(order)
    }),
  ],

  list: [
    validateQuery(paginationQuerySchema),
    asyncHandler(async (req, res) => {
      const q = req.validatedQuery ?? {}
      const status = typeof req.query.status === 'string' ? req.query.status : undefined
      const result = await orderService.listOrders(req.userId as string, {
        page: (q.page as number) ?? 1,
        limit: (q.limit as number) ?? 20,
        status,
      })
      res.json(result)
    }),
  ],

  getOne: asyncHandler(async (req, res) => {
    res.json(await orderService.getOrderForUser(req.userId as string, req.params.id as string))
  }),

  cancel: asyncHandler(async (req, res) => {
    res.json(await orderService.cancelOrder(req.userId as string, req.params.id as string))
  }),

  refill: asyncHandler(async (req, res) => {
    res.json(await orderService.requestRefill(req.userId as string, req.params.id as string))
  }),

  /**
   * Server-Sent Events stream of order status updates for the signed-in
   * customer. The client connects with a fetch() so the Authorization header
   * is sent; events are keyed by user id server-side, so a stream can never
   * leak another customer's orders. The client's 5s polling stays as the
   * fallback if this stream drops.
   */
  events: [
    asyncHandler(async (req, res) => {
      const userId = req.userId as string

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

      // Hello event — the client uses it to confirm the stream is live.
      send({ type: 'hello' })

      const unsubscribe = subscribeOrderStatus(userId, (payload) => {
        send({ type: 'order', ...payload })
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
