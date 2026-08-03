import rateLimit from 'express-rate-limit'
import { env } from '../config/env.js'

/** Global API limiter. */
export const apiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
})

/** Stricter limiter for payment and order checkout endpoints. */
export const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
})

/**
 * Stricter limiter for admin-management mutations (create admin, assign
 * roles).
 */
export const adminMutationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
})

/** Login limiter — throttles password guessing attempts. */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
})
