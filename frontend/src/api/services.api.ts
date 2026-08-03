import { apiClient } from './client'
import type { Announcement, Category, Paginated, Service } from '@/types/models'

export type ServiceSort = 'price_asc' | 'price_desc' | 'name_asc' | 'newest'

export interface ListServicesParams {
  category?: string
  search?: string
  featured?: boolean
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

  async categories(): Promise<Category[]> {
    const { data } = await apiClient.get<Category[]>('/categories')
    return data
  },

  async announcements(): Promise<Announcement[]> {
    const { data } = await apiClient.get<Announcement[]>('/announcements')
    return data
  },
}
