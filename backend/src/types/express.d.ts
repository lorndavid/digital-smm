import type { CustomerAuth } from '../modules/auth/types.js'

declare module 'express-serve-static-core' {
  interface Request {
    /** Verified customer identity (set by requireAuth). */
    auth?: CustomerAuth
    /** Local Mongo user id (set by attachUser). */
    userId?: string
    /** Validated query params (set by validateQuery). */
    validatedQuery?: Record<string, unknown>
  }
}

export {}
