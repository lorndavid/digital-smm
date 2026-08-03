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

export interface ListServicesParams {
  category?: string
  search?: string
  featured?: boolean
  includeInactive?: boolean
  page?: number
  limit?: number
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

    const [docs, total] = await Promise.all([
      ServiceModel.find(filter)
        .populate<{ category: CategoryDoc }>('category')
        .sort({ sortOrder: 1, createdAt: -1 })
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

  findByProviderName(name: string): Promise<CategoryDoc | null> {
    return this.findOne({ name })
  }

  /** Returns an existing category by name, or creates it. */
  async findOrCreateByName(name: string, platform = 'other'): Promise<CategoryDoc> {
    const existing = await this.findByProviderName(name)
    if (existing) return existing
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
    return CategoryModel.create({ name, slug: slug || 'category', platform })
  }

  listActive(): Promise<CategoryDoc[]> {
    return CategoryModel.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).exec()
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
