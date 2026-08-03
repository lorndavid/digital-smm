import type { NextFunction, Request, Response } from 'express'
import { verifyClerkToken } from '../config/clerk.js'
import { profileService } from '../services/profile.service.js'
import { ApiError } from '../utils/api-error.js'

/** Verifies the Clerk session JWT from the Authorization header. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    next(new ApiError(401, 'Missing session token'))
    return
  }
  try {
    req.auth = await verifyClerkToken(header.slice(7))
    next()
  } catch (err) {
    next(err)
  }
}

/** Ensures the local user record exists and exposes its Mongo id. */
export async function attachUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (!req.auth) {
    next(new ApiError(401, 'Unauthorized'))
    return
  }
  try {
    const user = await profileService.ensureUser(req.auth)
    req.userId = user._id.toString()
    next()
  } catch (err) {
    next(err)
  }
}

/** Composed auth middleware used on protected routes. */
export const authenticated = [requireAuth, attachUser]
