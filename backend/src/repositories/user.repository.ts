import type { HydratedDocument } from 'mongoose'
import { UserModel, type User, type UserDoc } from '../models/user.model.js'
import { BaseRepository } from './base.repository.js'

export class UserRepository extends BaseRepository<User> {
  constructor() {
    super(UserModel)
  }

  findByClerkId(clerkId: string): Promise<UserDoc | null> {
    return this.findOne({ clerkId })
  }

  /**
   * Upserts a user from a verified Clerk session. Called on every
   * authenticated request so the local profile always exists.
   */
  async upsertFromClerk(input: {
    clerkId: string
    email: string
    name?: string
    avatarUrl?: string
  }): Promise<UserDoc> {
    return UserModel.findOneAndUpdate(
      { clerkId: input.clerkId },
      {
        $set: {
          email: input.email,
          name: input.name ?? '',
          avatarUrl: input.avatarUrl ?? '',
          lastLoginAt: new Date(),
        },
        $setOnInsert: { role: 'customer', isActive: true },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).exec()
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

  setRole(userId: string, role: 'customer' | 'admin' | 'super_admin'): Promise<UserDoc | null> {
    return this.update(userId, { role })
  }

  /** Bulk-update all local users matching a Clerk id (role sync). */
  async updateManyByClerkId(
    clerkId: string,
    data: { role: 'customer' | 'admin' | 'super_admin' },
  ): Promise<void> {
    await UserModel.updateMany({ clerkId }, { $set: data }).exec()
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
