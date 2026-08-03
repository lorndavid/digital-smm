import type { FilterQuery, HydratedDocument, Model, UpdateQuery } from 'mongoose'

/**
 * Generic base repository implementing the common data-access operations.
 * Domain repositories extend this and add their own query methods,
 * keeping all persistence concerns inside the repository layer.
 */
export abstract class BaseRepository<T> {
  protected constructor(protected readonly model: Model<T>) {}

  findById(id: string): Promise<HydratedDocument<T> | null> {
    return this.model.findById(id).exec()
  }

  findOne(filter: FilterQuery<T>): Promise<HydratedDocument<T> | null> {
    return this.model.findOne(filter).exec()
  }

  find(filter: FilterQuery<T> = {}, limit = 50, skip = 0): Promise<HydratedDocument<T>[]> {
    return this.model.find(filter).sort({ createdAt: -1 }).limit(limit).skip(skip).exec()
  }

  count(filter: FilterQuery<T> = {}): Promise<number> {
    return this.model.countDocuments(filter).exec()
  }

  create(data: Partial<T>): Promise<HydratedDocument<T>> {
    return this.model.create(data)
  }

  update(id: string, data: UpdateQuery<T>): Promise<HydratedDocument<T> | null> {
    return this.model.findByIdAndUpdate(id, data, { new: true, runValidators: true }).exec()
  }

  delete(id: string): Promise<boolean> {
    return this.model.findByIdAndDelete(id).exec().then((doc) => doc !== null)
  }
}
