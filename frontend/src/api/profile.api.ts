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
}
