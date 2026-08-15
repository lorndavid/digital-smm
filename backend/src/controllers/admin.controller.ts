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
import { paymentRepository, walletRepository } from '../repositories/finance.repository.js'
import { userRepository } from '../repositories/user.repository.js'
import { adminRepository } from '../repositories/admin.repository.js'
import { hashPassword, loginAdmin } from '../services/admin-auth.service.js'
import { listAuditLogs, logAdminAction } from '../services/audit.service.js'
import { validate, validateQuery } from '../middleware/validate.middleware.js'
import {
  adminListQuerySchema,
  adminLoginBodySchema,
  announcementBodySchema,
  bulkServiceStatusBodySchema,
  bulkServiceProfitBodySchema,
  categoryBodySchema,
  createAdminBodySchema,
  orderStatusBodySchema,
  paginationQuerySchema,
  serviceBodySchema,
  serviceBulkBodySchema,
  settingBodySchema,
  updateAdminRoleBodySchema,
  userUpdateBodySchema,
} from '../validators/index.js'

const asString = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const asNumber = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

export const adminController = {
  // ------------------------------------------------------------------
  // Auth (email + password, stored in MongoDB)
  // ------------------------------------------------------------------

  login: [
    validate(adminLoginBodySchema),
    asyncHandler(async (req, res) => {
      const { email, password } = req.body
      res.json(await loginAdmin(email, password))
    }),
  ],

  me: asyncHandler(async (req, res) => {
    if (!req.admin) throw new ApiError(401, 'Unauthorized')
    const admin = await adminRepository.findById(req.admin.sub)
    if (!admin || !admin.isActive) throw new ApiError(401, 'Account disabled or removed')
    res.json({
      id: admin._id.toString(),
      email: admin.email,
      name: admin.name,
      role: admin.role,
    })
  }),

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
        status: asString(q.status) as 'active' | 'inactive' | 'featured' | undefined,
        page: asNumber(q.page, 1),
        limit: asNumber(q.limit, 20),
      })
      res.json({ items, total })
    }),
  ],

  bulkUpdateServices: [
    validate(serviceBulkBodySchema),
    asyncHandler(async (req, res) => {
      const { ids, data } = req.body
      const count = await serviceRepository.bulkUpdate(ids, data)
      await logAdminAction({
        actorId: req.admin?.sub ?? '',
        actorEmail: req.admin?.email,
        action: 'admin.bulk_services',
        details: { ids, data },
      })
      res.json({ updated: count })
    }),
  ],

  createService: [
    validate(serviceBodySchema),
    asyncHandler(async (req, res) => {
      const body = req.body
      const providerRate = typeof body.providerRate === 'number' ? body.providerRate : body.pricePerUnit
      const profitPercentage = typeof body.profitPercentage === 'number' ? body.profitPercentage : 0
      const pricePerUnit = Number((providerRate * (1 + profitPercentage / 100)).toFixed(6))

      const service = await serviceRepository.create({
        name: body.name,
        type: body.type,
        providerServiceId: body.providerServiceId ?? null,
        category: body.categoryId ?? null,
        description: body.description,
        image: body.image,
        providerRate,
        profitPercentage,
        pricePerUnit,
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

      const existing = await serviceRepository.findById(req.params.id as string)
      if (!existing) throw new ApiError(404, 'Service not found')

      let providerRate =
        typeof body.providerRate === 'number'
          ? body.providerRate
          : existing.providerRate > 0
            ? existing.providerRate
            : existing.pricePerUnit
      let profitPercentage =
        typeof body.profitPercentage === 'number' ? body.profitPercentage : existing.profitPercentage
      let pricePerUnit =
        typeof body.pricePerUnit === 'number' ? body.pricePerUnit : existing.pricePerUnit

      if (typeof body.pricePerUnit === 'number' && !('profitPercentage' in body)) {
        pricePerUnit = body.pricePerUnit
        if (providerRate > 0) {
          profitPercentage = Number((((pricePerUnit - providerRate) / providerRate) * 100).toFixed(2))
        }
      } else if ('providerRate' in body || 'profitPercentage' in body) {
        pricePerUnit = Number((providerRate * (1 + profitPercentage / 100)).toFixed(6))
      }

      update.providerRate = providerRate
      update.profitPercentage = profitPercentage
      update.pricePerUnit = pricePerUnit

      const service = await serviceRepository.update(req.params.id as string, update)
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

  /**
   * Bulk enable/disable services by ids and/or by category — the catalog
   * curation workflow for a large provider catalogue.
   */
  bulkSetServiceStatus: [
    validate(bulkServiceStatusBodySchema),
    asyncHandler(async (req, res) => {
      const { ids, categoryId, isActive } = req.body as {
        ids?: string[]
        categoryId?: string
        isActive: boolean
      }
      if (!ids?.length && !categoryId) {
        throw new ApiError(400, 'Provide at least one service id or a categoryId')
      }
      const filter: Record<string, unknown> = {}
      const or: Array<Record<string, unknown>> = []
      if (ids?.length) or.push({ _id: { $in: ids } })
      if (categoryId) or.push({ category: categoryId })
      if (or.length === 1) Object.assign(filter, or[0])
      else if (or.length > 1) filter.$or = or
      const updated = await serviceRepository.bulkSetStatus(filter, isActive)
      res.json({ updated, isActive })
    }),
  ],

  /**
   * Bulk set profit percentage by ids and/or category — recalculates selling price.
   */
  bulkSetServiceProfit: [
    validate(bulkServiceProfitBodySchema),
    asyncHandler(async (req, res) => {
      const { ids, categoryId, profitPercentage } = req.body as {
        ids?: string[]
        categoryId?: string
        profitPercentage: number
      }
      if (!ids?.length && !categoryId) {
        throw new ApiError(400, 'Provide at least one service id or a categoryId')
      }
      const filter: Record<string, unknown> = {}
      const or: Array<Record<string, unknown>> = []
      if (ids?.length) or.push({ _id: { $in: ids } })
      if (categoryId) or.push({ category: categoryId })
      if (or.length === 1) Object.assign(filter, or[0])
      else if (or.length > 1) filter.$or = or
      const updated = await serviceRepository.bulkSetProfitPercentage(filter, profitPercentage)
      res.json({ updated, profitPercentage })
    }),
  ],

  // ------------------------------------------------------------------
  // Categories
  // ------------------------------------------------------------------

  listCategories: [
    validateQuery(adminListQuerySchema),
    asyncHandler(async (req, res) => {
      const q = req.validatedQuery ?? {}
      res.json(
        await categoryRepository.listAdmin({
          search: asString(q.search),
          showEmpty: q.status === 'nonempty' ? false : undefined,
          sort: asString(q.sort) as 'name' | 'sortOrder' | 'count' | undefined,
          page: asNumber(q.page, 1),
          limit: asNumber(q.limit, 20),
        }),
      )
    }),
  ],

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

  getUserDetail: asyncHandler(async (req, res) => {
    const userId = req.params.id as string
    const user = await userRepository.findById(userId)
    if (!user) throw new ApiError(404, 'User not found')
    const doc = user.toObject ? user.toObject() : user
    const wallet = await walletRepository.findByUser(userId)
    res.json({
      user: {
        _id: doc._id.toString(),
        providerId: doc.providerId ?? '',
        provider: doc.provider ?? 'google',
        email: doc.email,
        name: doc.name ?? '',
        avatarUrl: doc.avatarUrl ?? '',
        role: doc.role ?? 'customer',
        isActive: doc.isActive ?? true,
        lastLoginAt: doc.lastLoginAt ? new Date(doc.lastLoginAt).toISOString() : null,
        createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
        wallet: wallet
          ? {
              balance: wallet.balance,
              totalTopUp: wallet.totalTopUp,
              totalSpent: wallet.totalSpent,
            }
          : null,
      },
    })
  }),

  getUserOrders: [
    validateQuery(paginationQuerySchema),
    asyncHandler(async (req, res) => {
      const q = req.validatedQuery ?? {}
      res.json(
        await orderRepository.list({
          userId: req.params.id as string,
          page: asNumber(q.page, 1),
          limit: asNumber(q.limit, 20),
        }),
      )
    }),
  ],

  getUserPayments: [
    validateQuery(paginationQuerySchema),
    asyncHandler(async (req, res) => {
      const q = req.validatedQuery ?? {}
      const [items, total] = await paymentRepository.listByUser(
        req.params.id as string,
        asNumber(q.page, 1),
        asNumber(q.limit, 20),
      )
      res.json({ items, total, page: asNumber(q.page, 1), limit: asNumber(q.limit, 20) })
    }),
  ],

  // ------------------------------------------------------------------
  // Admins & roles (super admin only) — MongoDB-backed
  // ------------------------------------------------------------------

  listAdmins: [
    validateQuery(adminListQuerySchema),
    asyncHandler(async (req, res) => {
      const q = req.validatedQuery ?? {}
      const [admins, total] = await adminRepository.listPaginated({
        search: asString(q.search),
        page: asNumber(q.page, 1),
        limit: asNumber(q.limit, 50),
      })
      res.json({
        items: admins.map((a) => ({
          id: a._id.toString(),
          email: a.email,
          name: a.name,
          role: a.role,
          isActive: a.isActive,
          createdAt: a.createdAt.toISOString(),
        })),
        total,
      })
    }),
  ],

  createAdmin: [
    validate(createAdminBodySchema),
    asyncHandler(async (req, res) => {
      const { email, password, name, role } = req.body
      const existing = await adminRepository.findByEmail(email)
      if (existing) throw new ApiError(409, 'An admin with this email already exists')
      const admin = await adminRepository.create({
        email,
        passwordHash: hashPassword(password),
        name: name ?? '',
        role,
        isActive: true,
      })
      await logAdminAction({
        actorId: req.admin?.sub ?? '',
        actorEmail: req.admin?.email,
        action: 'admin.create',
        targetId: admin._id.toString(),
        targetEmail: email,
        details: { role, name: name ?? '' },
      })
      res.status(201).json({
        id: admin._id.toString(),
        email: admin.email,
        name: admin.name,
        role: admin.role,
        isActive: admin.isActive,
        createdAt: admin.createdAt.toISOString(),
      })
    }),
  ],

  setAdminRole: [
    validate(updateAdminRoleBodySchema),
    asyncHandler(async (req, res) => {
      const adminId = req.params.id as string
      const { role } = req.body
      // Prevent the last super admin from demoting themselves and locking
      // everyone out of admin management.
      if (adminId === req.admin?.sub && role !== 'super_admin') {
        throw new ApiError(400, 'You cannot demote your own super admin role')
      }
      const admin = await adminRepository.setRole(adminId, role)
      if (!admin) throw new ApiError(404, 'Admin not found')
      await logAdminAction({
        actorId: req.admin?.sub ?? '',
        actorEmail: req.admin?.email,
        action: 'admin.set_role',
        targetId: adminId,
        targetEmail: admin.email,
        details: { role },
      })
      res.json({
        id: admin._id.toString(),
        email: admin.email,
        name: admin.name,
        role: admin.role,
        isActive: admin.isActive,
        createdAt: admin.createdAt.toISOString(),
      })
    }),
  ],

  listAuditLogs: [
    validateQuery(paginationQuerySchema),
    asyncHandler(async (req, res) => {
      const q = req.validatedQuery ?? {}
      res.json(
        await listAuditLogs({
          page: asNumber(q.page, 1),
          limit: asNumber(q.limit, 20),
        }),
      )
    }),
  ],

  removeAdminRole: asyncHandler(async (req, res) => {
    const adminId = req.params.id as string
    if (adminId === req.admin?.sub) {
      throw new ApiError(400, 'You cannot remove your own admin access')
    }
    const admin = await adminRepository.findById(adminId)
    if (!admin) throw new ApiError(404, 'Admin not found')
    await adminRepository.setActive(adminId, false)
    await logAdminAction({
      actorId: req.admin?.sub ?? '',
      actorEmail: req.admin?.email,
      action: 'admin.remove_role',
      targetId: adminId,
      targetEmail: admin.email,
      details: {},
    })
    res.json({ removed: true, email: admin.email })
  }),

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

  /**
   * Support-agent "Order again": re-places an order for the same customer,
   * funded from their wallet (insufficient balance → 400 with the wallet's
   * details). Audited so duplicate placements are traceable.
   */
  placeOrderAgain: asyncHandler(async (req, res) => {
    const id = req.params.id as string
    const order = await orderService.placeOrderAgainForAdmin(id)
    await logAdminAction({
      actorId: req.admin?.sub ?? '',
      actorEmail: req.admin?.email,
      action: 'admin.order_again',
      targetId: id,
      details: {
        newOrderId: order._id.toString(),
        orderNumber: order.orderNumber,
        totalPrice: order.totalPrice,
      },
    })
    res.status(201).json(order)
  }),

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
