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
  search?: string
  featured?: boolean
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
    if (params.featured) filter.isFeatured = true
    if (params.search) filter.name = { $regex: params.search, $options: 'i' }

    const page = params.page ?? 1
    const limit = params.limit ?? 50
    const skip = (page - 1) * limit

    const sort: Record<string, 1 | -1> =
      params.sort === 'price_asc'
        ? { pricePerUnit: 1 }
        : params.sort === 'price_desc'
          ? { pricePerUnit: -1 }
          : params.sort === 'name_asc'
            ? { name: 1 }
            : params.sort === 'newest'
              ? { createdAt: -1 }
              : { sortOrder: 1, createdAt: -1 }

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

  listAdmin(params: { search?: string; page?: number; limit?: number; category?: string }) {
    const filter: FilterQuery<Service> = {}
    if (params.search) filter.name = { $regex: params.search, $options: 'i' }
    if (params.category) filter.category = params.category
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
   * Bulk enables/disables services matching a filter (used by the admin
   * catalog-curation workflow, e.g. "disable every service in this category").
   * Returns the number of documents whose isActive value actually changed.
   */
  async bulkSetStatus(filter: Record<string, unknown>, isActive: boolean): Promise<number> {
    const result = await ServiceModel.updateMany(filter, { $set: { isActive } }).exec()
    return result.modifiedCount
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
   * Every category with per-category service counts (total + active) — used by
   * the admin Categories table so admins can see, at a glance, which categories
   * are empty or fully curated away. One aggregate pass over services.
   */
  async listWithCounts(): Promise<Array<Category & { serviceCount: number; activeServiceCount: number }>> {
    const [categories, rows] = await Promise.all([
      CategoryModel.find({}).sort({ sortOrder: 1, name: 1 }).exec(),
      ServiceModel.aggregate<{ _id: unknown; serviceCount: number; activeServiceCount: number }>([
        {
          $group: {
            _id: '$category',
            serviceCount: { $sum: 1 },
            activeServiceCount: { $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] } },
          },
        },
      ]).exec(),
    ])
    const counts = new Map(rows.map((r) => [String(r._id), r]))
    return categories.map((c) => {
      const row = counts.get(c._id.toString())
      return {
        ...c.toObject(),
        serviceCount: row?.serviceCount ?? 0,
        activeServiceCount: row?.activeServiceCount ?? 0,
      }
    })
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
