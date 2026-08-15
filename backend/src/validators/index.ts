import { z } from 'zod'
import { ORDER_STATUSES, ServiceType } from '../types/index.js'

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  // Up to 1,000 rows: the Explore page fetches a whole platform in one call
  // to group services client-side into subcategories.
  limit: z.coerce.number().int().min(1).max(1000).default(20),
})

// ---------------------------------------------------------------------------
// Public catalogue
// ---------------------------------------------------------------------------

export const listServicesQuerySchema = paginationQuerySchema.extend({
  category: z.string().optional(),
  platform: z.string().max(40).optional(),
  search: z.string().optional(),
  featured: z.enum(['true', 'false']).optional(),
  sort: z.enum(['price_asc', 'price_desc', 'name_asc', 'newest']).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  type: z.string().optional(),
  refill: z.enum(['true', 'false']).optional(),
  cancel: z.enum(['true', 'false']).optional(),
  provider: z.string().optional(),
})

// ---------------------------------------------------------------------------
// Customer auth — Google OAuth 2.0
// ---------------------------------------------------------------------------

export const googleUrlBodySchema = z.object({
  redirect: z.string().optional(),
  // S256 PKCE challenge (base64url, 43 chars) derived from the SPA verifier.
  codeChallenge: z
    .string()
    .regex(/^[A-Za-z0-9_-]{43}$/, 'codeChallenge must be a valid S256 PKCE challenge'),
})

export const googleExchangeBodySchema = z.object({
  code: z.string().min(1, 'Authorization code is required'),
  state: z.string().min(1, 'State is required'),
  // PKCE code_verifier held by the browser that started the flow.
  codeVerifier: z.string().min(43).max(128, 'Invalid code verifier'),
})

/** curated=true → only categories that still have at least one active service. */
export const listCategoriesQuerySchema = z.object({
  curated: z.enum(['true', 'false']).optional(),
})

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export const createOrderBodySchema = z.object({
  serviceId: z.string().min(1, 'serviceId is required'),
  link: z.string().optional(),
  quantity: z.number().int().positive().optional(),
  params: z.record(z.string(), z.unknown()).default({}),
})

export const orderStatusBodySchema = z.object({
  status: z.enum(ORDER_STATUSES),
})

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export const createPaymentBodySchema = z.object({
  purpose: z.enum(['topup', 'order']),
  amount: z.number().positive().optional(),
  serviceId: z.string().optional(),
  /** Reuse an existing pending order (retry / new QR). */
  orderId: z.string().optional(),
  link: z.string().optional(),
  quantity: z.number().int().positive().optional(),
  params: z.record(z.string(), z.unknown()).default({}),
})

export const verifyPaymentBodySchema = z.object({
  reference: z.string().min(1, 'Payment reference is required'),
})

export const cancelPaymentBodySchema = z.object({
  reference: z.string().min(1, 'Payment reference is required'),
})

export const paymentStatusQuerySchema = z.object({
  reference: z.string().min(1, 'Payment reference is required'),
})

export const retryPaymentBodySchema = z.object({
  orderId: z.string().min(1, 'orderId is required'),
})

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export const updateProfileBodySchema = z.object({
  name: z.string().trim().max(120).optional(),
  avatarUrl: z.union([z.url(), z.literal('')]).optional(),
})

/** Favourited category ids (full-list replace, capped at a sane catalogue size).
 *  Each entry must be a Mongo ObjectId so garbage can never be persisted. */
export const favoriteCategoriesBodySchema = z.object({
  categoryIds: z
    .array(z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid category id'))
    .max(200),
})

/** Favourited service ids (full-list replace, capped at a sane catalogue size). */
export const favoriteServicesBodySchema = z.object({
  serviceIds: z
    .array(z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid service id'))
    .max(200),
})

// ---------------------------------------------------------------------------
// Admin: services
// ---------------------------------------------------------------------------

export const serviceBodySchema = z.object({
  name: z.string().min(1).max(200),
  type: z.nativeEnum(ServiceType).default(ServiceType.Default),
  providerServiceId: z.number().int().positive().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  description: z.string().max(1000).default(''),
  image: z.string().default(''),
  providerRate: z.number().min(0).optional(),
  profitPercentage: z.number().min(0).optional(),
  pricePerUnit: z.number().min(0),
  currency: z.string().default('USD'),
  min: z.number().int().min(0).default(0),
  max: z.number().int().min(0).default(0),
  refill: z.boolean().default(false),
  cancel: z.boolean().default(false),
  deliveryTime: z.string().default(''),
  provider: z.string().default('smmwiz'),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
})

/** Bulk enable/disable services by ids and/or category. */
export const bulkServiceStatusBodySchema = z
  .object({
    ids: z.array(z.string().min(1)).max(500).optional(),
    categoryId: z.string().min(1).optional(),
    isActive: z.boolean(),
  })
  .refine((d) => (d.ids?.length ?? 0) > 0 || Boolean(d.categoryId), {
    message: 'Provide at least one service id or a categoryId',
    path: ['ids'],
  })

/** Bulk set profit percentage by ids and/or category. */
export const bulkServiceProfitBodySchema = z
  .object({
    ids: z.array(z.string().min(1)).max(500).optional(),
    categoryId: z.string().min(1).optional(),
    profitPercentage: z.number().min(0),
  })
  .refine((d) => (d.ids?.length ?? 0) > 0 || Boolean(d.categoryId), {
    message: 'Provide at least one service id or a categoryId',
    path: ['ids'],
  })

// ---------------------------------------------------------------------------
// Admin: categories
// ---------------------------------------------------------------------------

export const categoryBodySchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase with dashes')
    .optional(),
  platform: z
    .enum(['tiktok', 'facebook', 'instagram', 'youtube', 'telegram', 'other'])
    .default('other'),
  description: z.string().default(''),
  icon: z.string().default(''),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
})

// ---------------------------------------------------------------------------
// Admin: announcements
// ---------------------------------------------------------------------------

export const announcementBodySchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().default(''),
  type: z.enum(['info', 'success', 'warning', 'critical']).default('info'),
  isActive: z.boolean().default(true),
  expiresAt: z.string().datetime({ offset: true }).optional().nullable(),
})

// ---------------------------------------------------------------------------
// Admin: users, settings
// ---------------------------------------------------------------------------

export const userUpdateBodySchema = z.object({
  // Role changes are intentionally NOT allowed here — they must go through
  // the super-admin-only /admin/admins endpoints so the access gate (the
  // admin's role in MongoDB) stays authoritative.
  isActive: z.boolean().optional(),
})

// ---------------------------------------------------------------------------
// Admin: auth (email + password)
// ---------------------------------------------------------------------------

export const adminLoginBodySchema = z.object({
  email: z.string().email('A valid email is required'),
  password: z.string().min(1, 'Password is required'),
})

// ---------------------------------------------------------------------------
// Admin: admins & roles (super admin only)
// ---------------------------------------------------------------------------

export const createAdminBodySchema = z.object({
  email: z.string().email('A valid email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().trim().max(120).optional(),
  role: z.enum(['admin', 'super_admin']).default('admin'),
})

export const updateAdminRoleBodySchema = z.object({
  role: z.enum(['admin', 'super_admin']),
})

export const settingBodySchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
  description: z.string().optional(),
})

export const adminListQuerySchema = paginationQuerySchema
  .extend({
    search: z.string().optional(),
    status: z.string().optional(),
    category: z.string().optional(),
    // Admin lists (especially the 700+ category catalog) need bigger pages
    // than the public API's 100-row cap.
    limit: z.coerce.number().int().min(1).max(1000).default(20),
  })

export const serviceBulkBodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
  data: z.object({
    isActive: z.boolean().optional(),
    isFeatured: z.boolean().optional(),
  }),
})

