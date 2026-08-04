import type { HydratedDocument } from 'mongoose'
import { UserModel, type User, type UserDoc } from '../models/user.model.js'
import type { GoogleUserInfo } from '../modules/auth/types.js'
import { BaseRepository } from './base.repository.js'

export class UserRepository extends BaseRepository<User> {
  constructor() {
    super(UserModel)
  }

  findByProviderId(providerId: string): Promise<UserDoc | null> {
    return this.findOne({ providerId })
  }

  /**
   * Upserts a user from a verified Google profile.
   *
   * Atomic via `findOneAndUpdate` (upsert) so concurrent sign-ins for the
   * same account don't clash. Three scenarios:
   *
   * 1. Same `providerId` → update profile + lastLoginAt.
   * 2. Same `email` but different `providerId` (legacy Clerk-era account) →
   *    adopt it: keep the local user (orders, wallet, role) and re-key to
   *    the Google id.
   * 3. Brand-new account → create.
   *
   * The `providerId` unique index stays as a safety net on the `create`
   * path; the upsert uses `$setOnInsert` to avoid clobbering existing data.
   */
  async upsertFromGoogle(info: GoogleUserInfo): Promise<UserDoc> {
    const now = new Date()
    const updates = {
      $set: {
        email: info.email,
        name: info.name ?? '',
        avatarUrl: info.picture ?? '',
        lastLoginAt: now,
        provider: 'google' as const,
        isActive: true,
      },
      $setOnInsert: {
        providerId: info.sub,
        role: 'customer' as const,
        createdAt: now,
      },
    }

    // 1. Try by providerId first (fast path — known account).
    const byProviderId = await UserModel.findOneAndUpdate(
      { providerId: info.sub },
      updates,
      { new: true, runValidators: true },
    ).exec()
    if (byProviderId) return byProviderId

    // 2. Legacy adoption: same email, different providerId.
    const byEmail = await this.findOne({ email: info.email })
    if (byEmail) {
      byEmail.set({
        providerId: info.sub,
        provider: 'google',
        email: info.email,
        name: info.name ?? '',
        avatarUrl: info.picture ?? '',
        lastLoginAt: now,
        isActive: true,
      })
      try {
        return await byEmail.save()
      } catch (err) {
        // If the providerId was taken by a concurrent request, fetch the
        // winner and update that doc instead.
        if (err instanceof Error && 'code' in err && (err as { code?: number }).code === 11000) {
          const winner = await this.findByProviderId(info.sub)
          if (winner) {
            winner.set({
              email: info.email,
              name: info.name ?? '',
              avatarUrl: info.picture ?? '',
              lastLoginAt: now,
              isActive: true,
            })
            return winner.save()
          }
        }
        throw err
      }
    }

    // 3. Brand-new account. The $setOnInsert above ensures insert-only
    // fields are never overwritten on retry.
    try {
      return await UserModel.create({
        providerId: info.sub,
        provider: 'google',
        email: info.email,
        name: info.name ?? '',
        avatarUrl: info.picture ?? '',
        role: 'customer',
        isActive: true,
        lastLoginAt: now,
      })
    } catch (err) {
      if (err instanceof Error && 'code' in err && (err as { code?: number }).code === 11000) {
        const winner = await this.findByProviderId(info.sub)
        if (winner) {
          winner.set({
            email: info.email,
            name: info.name ?? '',
            avatarUrl: info.picture ?? '',
            lastLoginAt: now,
            isActive: true,
          })
          return winner.save()
        }
      }
      throw err
    }
  }

  listPaginated(params: { page: number; limit: number; search?: string }) {
    const filter: Record<string, unknown> = {}
    if (params.search) {
      filter.$or = [
        { email: { $regex: params.search, $options: 'i' } },
        { name: { $regex: params.search, $options: 'i' } },
      ]
    }
    const skip = (params.page - 1) * params.limit
    return Promise.all([
      UserModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(params.limit).exec(),
      UserModel.countDocuments(filter).exec(),
    ])
  }

  setActive(userId: string, isActive: boolean): Promise<UserDoc | null> {
    return this.update(userId, { isActive })
  }

  stats(): Promise<{ total: number; active: number }> {
    return Promise.all([
      UserModel.countDocuments().exec(),
      UserModel.countDocuments({ isActive: true }).exec(),
    ]).then(([total, active]) => ({ total, active }))
  }
}

export const userRepository = new UserRepository()

export type { HydratedDocument }
