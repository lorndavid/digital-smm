import { apiClient } from './client'
import type { Profile, UserProfile } from '@/types/models'

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
}
