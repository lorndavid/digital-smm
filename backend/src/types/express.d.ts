import type { ClerkAuth } from '../config/clerk.js'

declare module 'express-serve-static-core' {
  interface Request {
    /** Verified Clerk identity (set by requireAuth). */
    auth?: ClerkAuth
    /** Local Mongo user id (set by attachUser). */
    userId?: string
    /** Validated query params (set by validateQuery). */
    validatedQuery?: Record<string, unknown>
  }
}

export {}
