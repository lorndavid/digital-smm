import type { NextFunction, Request, Response } from 'express'
import { env } from '../config/env.js'
import { ApiError } from '../utils/api-error.js'
import { authenticated } from './auth.middleware.js'

/**
 * Grants access only to sessions whose custom session token claim matches
 * the configured admin role. Configure the claim in Clerk Dashboard:
 *   Sessions > Customize session token > add:
 *     { "role": "{{user.public_metadata.role}}" }
 * and set the user's public_metadata.role to "admin".
 */
export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth) {
    next(new ApiError(401, 'Unauthorized'))
    return
  }
  const claims = req.auth.claims as Record<string, unknown>
  const metadata = (claims.metadata ?? {}) as Record<string, unknown>
  const role = claims.role ?? metadata.role ?? claims.orgRole
  if (role !== env.CLERK_ADMIN_ROLE) {
    next(new ApiError(403, 'Admin access required'))
    return
  }
  next()
}

/** Composed middleware for admin-only routes. */
export const adminOnly = [...authenticated, requireAdmin]
