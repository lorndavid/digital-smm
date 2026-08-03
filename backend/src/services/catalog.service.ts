import {
  announcementRepository,
  categoryRepository,
  serviceRepository,
  type ListServicesParams,
} from '../repositories/catalog.repository.js'

/** Public catalogue reads (services, categories, announcements). */
export class CatalogService {
  categories() {
    return categoryRepository.listActive()
  }

  services(params: ListServicesParams) {
    return serviceRepository.listPublic(params)
  }

  announcements() {
    return announcementRepository.listActive()
  }
}

export const catalogService = new CatalogService()
