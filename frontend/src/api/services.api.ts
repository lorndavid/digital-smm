import { apiClient } from './client'
import type { Announcement, Category, Paginated, Service } from '@/types/models'

export type ServiceSort = 'price_asc' | 'price_desc' | 'name_asc' | 'newest'

export interface ListServicesParams {
  category?: string
  /** Platform keyword ('facebook', 'tiktok', …). Matches every category whose
   *  name contains the keyword — one chip shows the whole platform. */
  platform?: string
  search?: string
  featured?: boolean
  /** Min rate per 1,000 units (inclusive). */
  minPrice?: number
  /** Max rate per 1,000 units (inclusive). */
  maxPrice?: number
  /** Exact service type filter. */
  type?: string
  refill?: boolean
  cancel?: boolean
  page?: number
  limit?: number
  sort?: ServiceSort
}

/** Public catalogue endpoints (services, categories, announcements). */
export const servicesApi = {
  async list(params: ListServicesParams = {}): Promise<Paginated<Service>> {
    const { data } = await apiClient.get<Paginated<Service>>('/services', { params })
    return data
  },

  async categories(params: { curated?: boolean } = {}): Promise<Category[]> {
    const { data } = await apiClient.get<Category[]>('/categories', {
      params: params.curated === undefined ? {} : { curated: String(params.curated) },
    })
    return data
  },

  async announcements(): Promise<Announcement[]> {
    const { data } = await apiClient.get<Announcement[]>('/announcements')
    return data
  },
}
