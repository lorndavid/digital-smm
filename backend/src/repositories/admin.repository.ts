import type { HydratedDocument } from 'mongoose'
import { AdminModel, type Admin, type AdminDoc, type AdminRole } from '../models/admin.model.js'
import { BaseRepository } from './base.repository.js'

export class AdminRepository extends BaseRepository<Admin> {
  constructor() {
    super(AdminModel)
  }

  findByEmail(email: string): Promise<AdminDoc | null> {
    return this.findOne({ email: email.trim().toLowerCase() })
  }

  countSuperAdmins(): Promise<number> {
    return this.count({ role: 'super_admin' })
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
      AdminModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(params.limit).exec(),
      AdminModel.countDocuments(filter).exec(),
    ])
  }

  setRole(id: string, role: AdminRole): Promise<AdminDoc | null> {
    return this.update(id, { role })
  }

  setActive(id: string, isActive: boolean): Promise<AdminDoc | null> {
    return this.update(id, { isActive })
  }
}

export const adminRepository = new AdminRepository()

export type { HydratedDocument }
