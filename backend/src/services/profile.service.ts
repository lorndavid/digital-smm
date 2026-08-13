import { userRepository } from '../repositories/user.repository.js'
import { serviceRepository } from '../repositories/catalog.repository.js'
import { ApiError } from '../utils/api-error.js'
import { walletService } from './wallet.service.js'

/**
 * Profile + wallet management for signed-in customers.
 * (User creation happens in modules/auth/auth.service on Google sign-in.)
 */
export class ProfileService {
  async getProfile(userId: string) {
    const user = await userRepository.findById(userId)
    if (!user) throw new ApiError(404, 'User not found')
    const wallet = await walletService.getWallet(userId)
    return { user, wallet }
  }

  async updateProfile(userId: string, data: { name?: string; avatarUrl?: string }) {
    const updates: Record<string, unknown> = {}
    if (data.name !== undefined) updates.name = data.name
    if (data.avatarUrl !== undefined) updates.avatarUrl = data.avatarUrl
    if (Object.keys(updates).length === 0) {
      throw new ApiError(400, 'Nothing to update')
    }
    const user = await userRepository.update(userId, updates)
    if (!user) throw new ApiError(404, 'User not found')
    return user
  }

  /** Favourited category ids for a customer. */
  async getFavoriteCategories(userId: string) {
    const user = await userRepository.findById(userId)
    if (!user) throw new ApiError(404, 'User not found')
    return { categoryIds: user.favoriteCategories ?? [] }
  }

  /** Replaces the customer's favourite category ids (full-list sync). */
  async setFavoriteCategories(userId: string, categoryIds: string[]) {
    const user = await userRepository.update(userId, {
      favoriteCategories: [...new Set(categoryIds)],
    })
    if (!user) throw new ApiError(404, 'User not found')
    return { categoryIds: user.favoriteCategories }
  }

  /**
   * Favourited services for a customer — ids AND the resolved service docs
   * (active only), so the Favourites tab renders instantly with one request
   * instead of paging through the whole catalogue.
   */
  async getFavoriteServices(userId: string) {
    const user = await userRepository.findById(userId)
    if (!user) throw new ApiError(404, 'User not found')
    const serviceIds = user.favoriteServices ?? []
    return { serviceIds, services: await serviceRepository.findByIdsActive(serviceIds) }
  }

  /** Replaces the customer's favourite service ids (full-list sync). */
  async setFavoriteServices(userId: string, serviceIds: string[]) {
    const user = await userRepository.update(userId, {
      favoriteServices: [...new Set(serviceIds)],
    })
    if (!user) throw new ApiError(404, 'User not found')
    return {
      serviceIds: user.favoriteServices,
      services: await serviceRepository.findByIdsActive(user.favoriteServices ?? []),
    }
  }
}

export const profileService = new ProfileService()
