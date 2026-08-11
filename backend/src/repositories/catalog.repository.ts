import type { FilterQuery, HydratedDocument } from 'mongoose'
import { ServiceModel, type Service, type ServiceDoc } from '../models/service.model.js'
import { CategoryModel, type Category, type CategoryDoc } from '../models/category.model.js'
import {
  AnnouncementModel,
  type Announcement,
  type AnnouncementDoc,
} from '../models/announcement.model.js'
import { BaseRepository } from './base.repository.js'

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

export type ServiceSort = 'price_asc' | 'price_desc' | 'name_asc' | 'newest'

export interface ListServicesParams {
  category?: string
  /** Platform keyword (e.g. 'facebook', 'tiktok'). Matches ALL categories whose
    *  name contains the keyword, so one chip shows every service of that
    *  platform (SMMWiz splits platforms across many category names). */
  platform?: string
  search?: string
  featured?: boolean
  /** Minimum price per unit (inclusive). */
  minPrice?: number
  /** Maximum price per unit (inclusive). */
  maxPrice?: number
  /** Exact service type filter (e.g. 'Default', 'Custom Comments'). */
  type?: string
  /** Only services that support refill. */
  refill?: boolean
  /** Only services that support cancel. */
  cancel?: boolean
  /** Filter by SMM provider ('smmwiz', 'mock'). */
  provider?: string
  includeInactive?: boolean
  page?: number
  limit?: number
  sort?: ServiceSort
}

export class ServiceRepository extends BaseRepository<Service> {
  constructor() {
    super(ServiceModel)
  }

  findByProviderId(providerServiceId: number): Promise<ServiceDoc | null> {
    return this.findOne({ providerServiceId })
  }

  async listPublic(params: ListServicesParams) {
    const filter: FilterQuery<Service> = { isActive: true }
    if (params.category) filter.category = params.category
    if (params.platform) {
      // Resolve every category whose name mentions the platform so a single
      // chip (e.g. "Facebook") surfaces all Facebook-branded categories.
      const keyword = params.platform.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const ids = await CategoryModel.find({
        name: { $regex: keyword, $options: 'i' },
      })
        .select('_id')
        .lean()
        .exec()
      const platformIds = ids.map((c) => String(c._id))
      if (platformIds.length === 0) {
        return { items: [], total: 0, page: params.page ?? 1, limit: params.limit ?? 50 }
      }
      filter.category = { $in: platformIds }
    }
    if (params.featured) filter.isFeatured = true
    if (params.search) {
      // Multi-word queries: split into words and require EVERY word to match
      // the service name, description or category name — so "facebook live
      // stream" finds Facebook live-stream services without needing the whole
      // phrase in a single field.
      const terms = params.search.trim().toLowerCase().split(/\s+/).filter(Boolean)
      const termFilters = await Promise.all(
        terms.map(async (term) => {
          const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          const catIds = await CategoryModel.find({ name: { $regex: esc, $options: 'i' } })
            .select('_id')
            .lean()
            .exec()
          const ors: FilterQuery<Service>[] = [
            { name: { $regex: esc, $options: 'i' } },
            { description: { $regex: esc, $options: 'i' } },
          ]
          if (catIds.length) ors.push({ category: { $in: catIds.map((c) => String(c._id)) } })
          return { $or: ors }
        }),
      )
      // A whitespace-only search yields no terms — guard so an empty $and
      // never silently matches every service.
      if (termFilters.length === 1) Object.assign(filter, termFilters[0])
      else if (termFilters.length > 1) filter.$and = termFilters
    }
    if (params.type) filter.type = params.type
    if (params.refill) filter.refill = true
    if (params.cancel) filter.cancel = true
    if (params.provider) filter.provider = params.provider
    if (params.minPrice !== undefined || params.maxPrice !== undefined) {
      filter.pricePerUnit = {
        ...(params.minPrice !== undefined ? { $gte: params.minPrice } : {}),
        ...(params.maxPrice !== undefined ? { $lte: params.maxPrice } : {}),
      }
    }

    const page = params.page ?? 1
    const limit = params.limit ?? 50
    const skip = (page - 1) * limit

    // "Recommended" is the default storefront order: featured/trending services
    // first, then the admin-set display order, then newest.
    const sort: Record<string, 1 | -1> =
      params.sort === 'price_asc'
        ? { pricePerUnit: 1 }
        : params.sort === 'price_desc'
          ? { pricePerUnit: -1 }
          : params.sort === 'name_asc'
            ? { name: 1 }
            : params.sort === 'newest'
              ? { createdAt: -1 }
              : { isFeatured: -1, sortOrder: 1, createdAt: -1 }

    const [docs, total] = await Promise.all([
      ServiceModel.find(filter)
        .populate<{ category: CategoryDoc }>('category')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .exec(),
      ServiceModel.countDocuments(filter).exec(),
    ])
    return { items: docs, total, page, limit }
  }

  listAdmin(params: {
    search?: string
    page?: number
    limit?: number
    category?: string
    status?: 'active' | 'inactive' | 'featured'
  }) {
    const filter: FilterQuery<Service> = {}
    if (params.search) filter.name = { $regex: params.search, $options: 'i' }
    if (params.category) filter.category = params.category
    if (params.status === 'active') filter.isActive = true
    if (params.status === 'inactive') filter.isActive = false
    if (params.status === 'featured') filter.isFeatured = true
    const page = params.page ?? 1
    const limit = params.limit ?? 50
    const skip = (page - 1) * limit
    return Promise.all([
      ServiceModel.find(filter)
        .populate<{ category: CategoryDoc }>('category')
        .sort({ sortOrder: 1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      ServiceModel.countDocuments(filter).exec(),
    ])
  }

  /**
   * Bulk-updates services by ids (used by the admin curation toolbar:
   * hide/show/feature selected services). Returns the number of matched docs.
   */
  bulkUpdate(ids: string[], data: Record<string, unknown>): Promise<number> {
    if (ids.length === 0) return Promise.resolve(0)
    return ServiceModel.updateMany({ _id: { $in: ids } }, { $set: data })
      .exec()
      .then((r) => r.modifiedCount)
  }

  /**
   * Bulk enables/disables services matching a filter (used by the admin
   * catalog-curation workflow, e.g. "disable every service in this category").
   * Returns the number of documents whose isActive value actually changed.
   */
  async bulkSetStatus(filter: Record<string, unknown>, isActive: boolean): Promise<number> {
    const result = await ServiceModel.updateMany(filter, { $set: { isActive } }).exec()
    return result.modifiedCount
  }

  /** Creates or updates a service synced from the provider catalogue. */
  async upsertFromProvider(input: {
    providerServiceId: number
    name: string
    type: string
    categoryId: string | null
    pricePerUnit: number
    min: number
    max: number
    refill: boolean
    cancel: boolean
    provider: string
  }): Promise<ServiceDoc> {
    return ServiceModel.findOneAndUpdate(
      { providerServiceId: input.providerServiceId },
      { $set: input },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).exec()
  }

  stats(): Promise<{ total: number; active: number }> {
    return Promise.all([
      ServiceModel.countDocuments().exec(),
      ServiceModel.countDocuments({ isActive: true }).exec(),
    ]).then(([total, active]) => ({ total, active }))
  }
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export class CategoryRepository extends BaseRepository<Category> {
  constructor() {
    super(CategoryModel)
  }

  findBySlug(slug: string): Promise<CategoryDoc | null> {
    return this.findOne({ slug })
  }

  /**
   * Active categories. When `curated` is true, only categories that still
   * have at least one ACTIVE service are returned — so admins can bulk-disable
   * every service of a category and have it disappear from the storefront.
   */
  async listActive(curated = false): Promise<CategoryDoc[]> {
    const sort = { sortOrder: 1, name: 1 } as const
    if (!curated) {
      return CategoryModel.find({ isActive: true }).sort(sort).exec()
    }
    const categoryIds = await ServiceModel.distinct('category', { isActive: true }).exec()
    return CategoryModel.find({ isActive: true, _id: { $in: categoryIds } }).sort(sort).exec()
  }

  /**
   * Admin listing with per-category service counts, search, empty-filtering
   * and sorting (by name, sortOrder or service count). Uses an aggregation
   * to count services per category in a single pass.
   */
  async listAdmin(params: {
    search?: string
    page?: number
    limit?: number
    /** When false, categories with zero services are hidden. */
    showEmpty?: boolean
    sort?: 'name' | 'sortOrder' | 'count'
  }) {
    const search = params.search?.trim()
    const filter: FilterQuery<Category> = search
      ? { name: { $regex: search, $options: 'i' } }
      : {}

    const counts = await ServiceModel.aggregate<{
      _id: string
      count: number
      activeCount: number
    }>([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          activeCount: { $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] } },
        },
      },
    ]).exec()
    const countMap = new Map<string, number>(
      counts.filter((c) => c._id).map((c) => [String(c._id), c.count]),
    )
    const activeCountMap = new Map<string, number>(
      counts.filter((c) => c._id).map((c) => [String(c._id), c.activeCount]),
    )

    const [docs, totalBeforeFilter] = await Promise.all([
      CategoryModel.find(filter).lean().exec(),
      CategoryModel.countDocuments(filter).exec(),
    ])

    let rows = docs.map((d) => ({
      ...d,
      serviceCount: countMap.get(String(d._id)) ?? 0,
      activeServiceCount: activeCountMap.get(String(d._id)) ?? 0,
    }))

    const showEmpty = params.showEmpty !== false
    if (!showEmpty) rows = rows.filter((r) => r.serviceCount > 0)

    type Row = (typeof rows)[number]
    const sort: (a: Row, b: Row) => number =
      params.sort === 'name'
        ? (a, b) => a.name.localeCompare(b.name)
        : params.sort === 'count'
          ? (a, b) => b.serviceCount - a.serviceCount || a.name.localeCompare(b.name)
          : (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
    rows = rows.sort(sort)

    const page = params.page ?? 1
    const limit = params.limit ?? 20
    const total = rows.length
    const start = (page - 1) * limit
    const items = rows.slice(start, start + limit)

    return { items, total, page, limit }
  }
}

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

export class AnnouncementRepository extends BaseRepository<Announcement> {
  constructor() {
    super(AnnouncementModel)
  }

  listActive(): Promise<AnnouncementDoc[]> {
    return AnnouncementModel.find({
      isActive: true,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    })
      .sort({ createdAt: -1 })
      .exec()
  }

  listPaginated(params: { page: number; limit: number }) {
    const skip = (params.page - 1) * params.limit
    return Promise.all([
      AnnouncementModel.find().sort({ createdAt: -1 }).skip(skip).limit(params.limit).exec(),
      AnnouncementModel.countDocuments().exec(),
    ])
  }
}

export type { HydratedDocument, ServiceDoc, CategoryDoc }

export const serviceRepository = new ServiceRepository()
export const categoryRepository = new CategoryRepository()
export const announcementRepository = new AnnouncementRepository()
