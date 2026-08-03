import { orderService } from '../services/order.service.js'
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
}
