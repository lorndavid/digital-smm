import type { ClerkAuth } from '../config/clerk.js'
import { userRepository } from '../repositories/user.repository.js'
import { ApiError } from '../utils/api-error.js'
import { walletService } from './wallet.service.js'

/** Profile + wallet management, backed by verified Clerk sessions. */
export class ProfileService {
  /** Ensures a local user exists for a verified Clerk identity. */
  ensureUser(auth: ClerkAuth) {
    const claims = auth.claims as Record<string, unknown>
    const email = typeof claims.email === 'string' && claims.email ? claims.email : auth.userId
    return userRepository.upsertFromClerk({
      clerkId: auth.userId,
      email,
      name: typeof claims.name === 'string' ? claims.name : undefined,
      avatarUrl: typeof claims.picture === 'string' ? claims.picture : undefined,
    })
  }

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
}

export const profileService = new ProfileService()
