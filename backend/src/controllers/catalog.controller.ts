import { catalogService } from '../services/catalog.service.js'
import { asyncHandler } from '../utils/async-handler.js'
import { validateQuery } from '../middleware/validate.middleware.js'
import { listServicesQuerySchema } from '../validators/index.js'

export const catalogController = {
  getServices: [
    validateQuery(listServicesQuerySchema),
    asyncHandler(async (req, res) => {
      const q = req.validatedQuery ?? {}
      const result = await catalogService.services({
        page: (q.page as number) ?? 1,
        limit: (q.limit as number) ?? 20,
        category: typeof q.category === 'string' ? q.category : undefined,
        search: typeof q.search === 'string' ? q.search : undefined,
        featured: q.featured === 'true' ? true : undefined,
      })
      res.json(result)
    }),
  ],

  getCategories: asyncHandler(async (_req, res) => {
    res.json(await catalogService.categories())
  }),

  getAnnouncements: asyncHandler(async (_req, res) => {
    res.json(await catalogService.announcements())
  }),
}
