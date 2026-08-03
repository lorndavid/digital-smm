import { asyncHandler } from '../utils/async-handler.js'
import { ApiError } from '../utils/api-error.js'
import { toCsv } from '../utils/csv.js'
import { adminService } from '../services/admin.service.js'
import { orderService } from '../services/order.service.js'
import {
  announcementRepository,
  categoryRepository,
  serviceRepository,
} from '../repositories/catalog.repository.js'
import { orderRepository } from '../repositories/order.repository.js'
import { paymentRepository } from '../repositories/finance.repository.js'
import { userRepository } from '../repositories/user.repository.js'
import { validate, validateQuery } from '../middleware/validate.middleware.js'
import {
  adminListQuerySchema,
  announcementBodySchema,
  categoryBodySchema,
  orderStatusBodySchema,
  paginationQuerySchema,
  serviceBodySchema,
  settingBodySchema,
  userUpdateBodySchema,
} from '../validators/index.js'

const asString = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const asNumber = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

export const adminController = {
  dashboard: asyncHandler(async (_req, res) => {
    res.json(await adminService.dashboardStats())
  }),

  syncServices: asyncHandler(async (_req, res) => {
    res.json(await adminService.syncProviderServices())
  }),

  // ------------------------------------------------------------------
  // Services
  // ------------------------------------------------------------------

  listServices: [
    validateQuery(adminListQuerySchema),
    asyncHandler(async (req, res) => {
      const q = req.validatedQuery ?? {}
      const [items, total] = await serviceRepository.listAdmin({
        search: asString(q.search),
        category: asString(q.category),
        page: asNumber(q.page, 1),
        limit: asNumber(q.limit, 20),
      })
      res.json({ items, total })
    }),
  ],

  createService: [
    validate(serviceBodySchema),
    asyncHandler(async (req, res) => {
      const body = req.body
      const service = await serviceRepository.create({
        name: body.name,
        type: body.type,
        providerServiceId: body.providerServiceId ?? null,
        category: body.categoryId ?? null,
        description: body.description,
        image: body.image,
        pricePerUnit: body.pricePerUnit,
        currency: body.currency,
        min: body.min,
        max: body.max,
        refill: body.refill,
        cancel: body.cancel,
        deliveryTime: body.deliveryTime,
        provider: body.provider,
        isActive: body.isActive,
        isFeatured: body.isFeatured,
        sortOrder: body.sortOrder,
      })
      res.status(201).json(service)
    }),
  ],

  updateService: [
    validate(serviceBodySchema.partial()),
    asyncHandler(async (req, res) => {
      const body = req.body
      const update: Record<string, unknown> = { ...body }
      if ('categoryId' in body) update.category = body.categoryId ?? null
      delete update.categoryId
      const service = await serviceRepository.update(req.params.id as string, update)
      if (!service) throw new ApiError(404, 'Service not found')
      res.json(service)
    }),
  ],

  deleteService: asyncHandler(async (req, res) => {
    const orderCount = await orderRepository.count({ service: req.params.id as string })
    if (orderCount > 0) {
      throw new ApiError(409, 'Cannot delete: orders exist for this service. Disable it instead.')
    }
    const deleted = await serviceRepository.delete(req.params.id as string)
    if (!deleted) throw new ApiError(404, 'Service not found')
    res.json({ deleted: true })
  }),

  // ------------------------------------------------------------------
  // Categories
  // ------------------------------------------------------------------

  listCategories: asyncHandler(async (_req, res) => {
    const items = await categoryRepository.find({})
    res.json({ items })
  }),

  createCategory: [
    validate(categoryBodySchema),
    asyncHandler(async (req, res) => {
      const body = req.body
      const slug =
        body.slug ??
        body.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '')
      const existing = await categoryRepository.findBySlug(slug)
      if (existing) throw new ApiError(409, 'A category with this slug already exists')
      res.status(201).json(await categoryRepository.create({ ...body, slug }))
    }),
  ],

  updateCategory: [
    validate(categoryBodySchema.partial()),
    asyncHandler(async (req, res) => {
      const category = await categoryRepository.update(req.params.id as string, req.body)
      if (!category) throw new ApiError(404, 'Category not found')
      res.json(category)
    }),
  ],

  deleteCategory: asyncHandler(async (req, res) => {
    const serviceCount = await serviceRepository.count({ category: req.params.id as string })
    if (serviceCount > 0) {
      throw new ApiError(409, 'Cannot delete: services exist in this category')
    }
    const deleted = await categoryRepository.delete(req.params.id as string)
    if (!deleted) throw new ApiError(404, 'Category not found')
    res.json({ deleted: true })
  }),

  // ------------------------------------------------------------------
  // Users
  // ------------------------------------------------------------------

  listUsers: [
    validateQuery(adminListQuerySchema),
    asyncHandler(async (req, res) => {
      const q = req.validatedQuery ?? {}
      const [items, total] = await userRepository.listPaginated({
        page: asNumber(q.page, 1),
        limit: asNumber(q.limit, 20),
        search: asString(q.search),
      })
      res.json({ items, total })
    }),
  ],

  updateUser: [
    validate(userUpdateBodySchema),
    asyncHandler(async (req, res) => {
      const user = await userRepository.update(req.params.id as string, req.body)
      if (!user) throw new ApiError(404, 'User not found')
      res.json(user)
    }),
  ],

  // ------------------------------------------------------------------
  // Orders
  // ------------------------------------------------------------------

  listOrders: [
    validateQuery(adminListQuerySchema),
    asyncHandler(async (req, res) => {
      const q = req.validatedQuery ?? {}
      res.json(
        await orderRepository.list({
          status: asString(q.status),
          search: asString(q.search),
          page: asNumber(q.page, 1),
          limit: asNumber(q.limit, 20),
        }),
      )
    }),
  ],

  getOrder: asyncHandler(async (req, res) => {
    res.json(await orderService.getOrderForAdmin(req.params.id as string))
  }),

  updateOrderStatus: [
    validate(orderStatusBodySchema),
    asyncHandler(async (req, res) => {
      const order = await orderRepository.update(req.params.id as string, { status: req.body.status })
      if (!order) throw new ApiError(404, 'Order not found')
      res.json(order)
    }),
  ],

  // ------------------------------------------------------------------
  // Payments
  // ------------------------------------------------------------------

  listPayments: [
    validateQuery(adminListQuerySchema),
    asyncHandler(async (req, res) => {
      const q = req.validatedQuery ?? {}
      const [items, total] = await paymentRepository.listAdmin({
        status: asString(q.status),
        search: asString(q.search),
        page: asNumber(q.page, 1),
        limit: asNumber(q.limit, 20),
      })
      res.json({ items, total })
    }),
  ],

  paymentsStats: asyncHandler(async (_req, res) => {
    res.json(await paymentRepository.paymentStats())
  }),

  paymentsExport: [
    validateQuery(adminListQuerySchema),
    asyncHandler(async (req, res) => {
      const q = req.validatedQuery ?? {}
      const rows = await paymentRepository.findForExport(
        asString(q.status),
        asString(q.search),
      )
      const csv = toCsv(
        ['Reference', 'Provider', 'Purpose', 'Amount', 'Currency', 'Status', 'Customer', 'Order #', 'Created', 'Approved'],
        rows.map((p) => {
          const user = p.user as unknown as { name?: string; email?: string }
          const order = p.order as unknown as { orderNumber?: number } | null
          return [
            p.referenceId,
            p.provider,
            p.purpose,
            p.amount,
            p.currency,
            p.status,
            user?.name || user?.email || '',
            order?.orderNumber ?? '',
            p.createdAt ? new Date(p.createdAt).toISOString() : '',
            p.approvedAt ? new Date(p.approvedAt).toISOString() : '',
          ]
        }),
      )
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', 'attachment; filename="payments.csv"')
      res.send(csv)
    }),
  ],

  // ------------------------------------------------------------------
  // Announcements
  // ------------------------------------------------------------------

  listAnnouncements: [
    validateQuery(paginationQuerySchema),
    asyncHandler(async (req, res) => {
      const q = req.validatedQuery ?? {}
      const [items, total] = await announcementRepository.listPaginated({
        page: asNumber(q.page, 1),
        limit: asNumber(q.limit, 20),
      })
      res.json({ items, total })
    }),
  ],

  createAnnouncement: [
    validate(announcementBodySchema),
    asyncHandler(async (req, res) => {
      const body = req.body
      res.status(201).json(
        await announcementRepository.create({
          ...body,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        }),
      )
    }),
  ],

  updateAnnouncement: [
    validate(announcementBodySchema.partial()),
    asyncHandler(async (req, res) => {
      const body = req.body
      const update: Record<string, unknown> = { ...body }
      if ('expiresAt' in body) update.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null
      const announcement = await announcementRepository.update(req.params.id as string, update)
      if (!announcement) throw new ApiError(404, 'Announcement not found')
      res.json(announcement)
    }),
  ],

  deleteAnnouncement: asyncHandler(async (req, res) => {
    const deleted = await announcementRepository.delete(req.params.id as string)
    if (!deleted) throw new ApiError(404, 'Announcement not found')
    res.json({ deleted: true })
  }),

  // ------------------------------------------------------------------
  // Settings
  // ------------------------------------------------------------------

  listSettings: asyncHandler(async (_req, res) => {
    res.json(await adminService.getAllSettings())
  }),

  getSetting: asyncHandler(async (req, res) => {
    res.json(await adminService.getSetting(req.params.key as string))
  }),

  setSetting: [
    validate(settingBodySchema),
    asyncHandler(async (req, res) => {
      const { key, value, description } = req.body
      res.json(await adminService.setSetting(key, value, description))
    }),
  ],
}
