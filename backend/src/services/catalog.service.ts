import {
  announcementRepository,
  categoryRepository,
  serviceRepository,
  type ListServicesParams,
} from '../repositories/catalog.repository.js'
import { ServiceModel } from '../models/service.model.js'

/** Public catalogue reads (services, categories, announcements). */
export class CatalogService {
  categories(curated = false) {
    return categoryRepository.listActive(curated)
  }

  services(params: ListServicesParams) {
    return serviceRepository.listPublic(params)
  }

  /** Single ACTIVE service by id (public SEO pages). 404 when hidden/missing. */
  async serviceById(id: string) {
    const service = await serviceRepository.findOne({ _id: id, isActive: true })
    if (!service) return null
    return service.populate<{ category: unknown }>('category')
  }

  /** All active services (SEO sitemap generation) — no pagination cap. */
  allActiveServices() {
    return ServiceModel.find({ isActive: true })
      .populate<{ category: unknown }>('category')
      .exec()
  }

  announcements() {
    return announcementRepository.listActive()
  }
}

export const catalogService = new CatalogService()
