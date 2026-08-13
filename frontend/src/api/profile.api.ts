import { apiClient } from './client'
import type { Profile, Service, UserProfile } from '@/types/models'

/** Authenticated profile + wallet endpoints. */
export const profileApi = {
  async get(): Promise<Profile> {
    const { data } = await apiClient.get<Profile>('/profile')
    return data
  },

  async update(input: { name?: string; avatarUrl?: string }): Promise<UserProfile> {
    const { data } = await apiClient.patch<UserProfile>('/profile', input)
    return data
  },

  /** Favourited category ids (for the Favourites tab). */
  async getFavorites(): Promise<string[]> {
    const { data } = await apiClient.get<{ categoryIds: string[] }>('/profile/favorites')
    return data.categoryIds
  },

  /** Replaces the customer's favourite category ids. */
  async setFavorites(categoryIds: string[]): Promise<string[]> {
    const { data } = await apiClient.put<{ categoryIds: string[] }>('/profile/favorites', {
      categoryIds,
    })
    return data.categoryIds
  },

  /** Favourited services (ids + resolved docs) for the Favourites tab. */
  async getFavoriteServices(): Promise<{ serviceIds: string[]; services: Service[] }> {
    const { data } = await apiClient.get<{ serviceIds: string[]; services: Service[] }>(
      '/profile/favorites/services',
    )
    return data
  },

  /** Replaces the customer's favourite service ids; returns the resolved list. */
  async setFavoriteServices(serviceIds: string[]): Promise<{
    serviceIds: string[]
    services: Service[]
  }> {
    const { data } = await apiClient.put<{ serviceIds: string[]; services: Service[] }>(
      '/profile/favorites/services',
      { serviceIds },
    )
    return data
  },
}
