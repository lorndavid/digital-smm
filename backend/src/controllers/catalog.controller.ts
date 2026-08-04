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
        platform: typeof q.platform === 'string' ? q.platform : undefined,
        search: typeof q.search === 'string' ? q.search : undefined,
        featured: q.featured === 'true' ? true : undefined,
        minPrice: typeof q.minPrice === 'number' ? q.minPrice : undefined,
        maxPrice: typeof q.maxPrice === 'number' ? q.maxPrice : undefined,
        type: typeof q.type === 'string' ? q.type : undefined,
        refill: q.refill === 'true' ? true : undefined,
        cancel: q.cancel === 'true' ? true : undefined,
        sort: (q.sort as 'price_asc' | 'price_desc' | 'name_asc' | 'newest' | undefined),
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
