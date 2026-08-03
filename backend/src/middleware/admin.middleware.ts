import type { NextFunction, Request, Response } from 'express'
import { ApiError } from '../utils/api-error.js'
import { verifyAdminToken, type AdminTokenPayload } from '../services/admin-auth.service.js'

/**
 * Admin authentication — verifies the admin session JWT (HS256, signed with
 * ADMIN_JWT_SECRET) from the Authorization header. Admins are stored in
 * MongoDB and sign in with email + password; this is fully independent of
 * the customer Clerk flow.
 */

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: AdminTokenPayload
    }
  }
}

/** Verifies the admin JWT and attaches `req.admin`. */
export async function requireAdminAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    next(new ApiError(401, 'Missing admin session token'))
    return
  }
  try {
    req.admin = await verifyAdminToken(header.slice(7))
    next()
  } catch (err) {
    next(err)
  }
}

/** Allows any authenticated admin (admin or super_admin). */
export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.admin) {
    next(new ApiError(401, 'Unauthorized'))
    return
  }
  next()
}

/** Allows only super admins — used for admin-management routes. */
export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.admin) {
    next(new ApiError(401, 'Unauthorized'))
    return
  }
  if (req.admin.role !== 'super_admin') {
    next(new ApiError(403, 'Super admin access required'))
    return
  }
  next()
}

/** Composed middlewares. */
export const adminOnly = [requireAdminAuth, requireAdmin]
export const superAdminOnly = [requireAdminAuth, requireSuperAdmin]
