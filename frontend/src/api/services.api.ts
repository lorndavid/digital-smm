import { apiClient } from './client'
import type { Announcement, Category, Paginated, Service } from '@/types/models'

export interface ListServicesParams {
  category?: string
  search?: string
  featured?: boolean
  page?: number
  limit?: number
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
