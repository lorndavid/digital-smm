import type { NextFunction, Request, Response } from 'express'
import { verifyCustomerToken } from '../modules/auth/session.js'
import { userRepository } from '../repositories/user.repository.js'
import { ApiError } from '../utils/api-error.js'

/**
 * Customer authentication — verifies the customer session JWT (HS256, signed
 * with CUSTOMER_JWT_SECRET) from the Authorization header. The token's `sub`
 * is the LOCAL Mongo user id, so attachUser maps straight to the database.
 */

/** Verifies the customer session JWT from the Authorization header. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    next(new ApiError(401, 'Missing session token'))
    return
  }
  try {
    req.auth = await verifyCustomerToken(header.slice(7))
    next()
  } catch (err) {
    next(err)
  }
}

/**
 * Resolves the local Mongo user id and rejects disabled/removed accounts.
 * (The user was created at sign-in; this also refreshes lastLoginAt lightly
 * only when absent, keeping the per-request cost to a single indexed read.)
 */
export async function attachUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (!req.auth) {
    next(new ApiError(401, 'Unauthorized'))
    return
  }
  try {
    const user = await userRepository.findById(req.auth.userId)
    if (!user || !user.isActive) {
      throw new ApiError(401, 'Account disabled or not found')
    }
    req.userId = user._id.toString()
    next()
  } catch (err) {
    next(err)
  }
}

/** Composed auth middleware used on protected routes. */
export const authenticated = [requireAuth, attachUser]
