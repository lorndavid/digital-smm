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
   * Re-keys an existing local account (e.g. a legacy Clerk-era row) to a
   * Google identity and refreshes its profile. Used by both the legacy
   * adoption path and the create-catch fallback so the logic lives in one
   * place. If another request claims `providerId` mid-save (duplicate key),
   * we re-fetch the winner and update that document instead.
   */
  private async adoptExisting(doc: UserDoc, info: GoogleUserInfo, now: Date): Promise<UserDoc> {
    const setProfile = (target: UserDoc) => {
      target.set({
        providerId: info.sub,
        provider: 'google',
        email: info.email,
        name: info.name ?? '',
        avatarUrl: info.picture ?? '',
        lastLoginAt: now,
        isActive: true,
      })
      return target
    }
    try {
      return await setProfile(doc).save()
    } catch (err) {
      // A concurrent request inserted the same providerId — adopt the winner.
      if (err instanceof Error && 'code' in err && (err as { code?: number }).code === 11000) {
        const winner = await this.findByProviderId(info.sub)
        if (winner) return setProfile(winner).save()
      }
      throw err
    }
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
    if (byEmail) return this.adoptExisting(byEmail, info, now)

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
      // A concurrent request won the insert (or a stale legacy unique index
      // rejected the row) — recover by adopting the existing account instead
      // of surfacing a duplicate-key 409 to the customer.
      if (err instanceof Error && 'code' in err && (err as { code?: number }).code === 11000) {
        const winner = await this.findByProviderId(info.sub)
        if (winner) return this.adoptExisting(winner, info, now)
        const adopted = await this.findOne({ email: info.email })
        if (adopted) return this.adoptExisting(adopted, info, now)
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
