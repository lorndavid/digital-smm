import rateLimit from 'express-rate-limit'
import { env } from '../config/env.js'

/**
 * Global API limiter.
 *
 * Scaled for 100–300 users behind shared NAT (office / ISP carrier).
 * 3000 requests per 15 min window ≈ 200/hr ≈ 3.3/min per user at
 * peak concurrency. The env variable `RATE_LIMIT_MAX` controls the
 * actual value (default 3000).
 *
 * Auth endpoints (/auth/google/url + /auth/google/exchange) are exempt
 * from the global limiter so the OAuth redirect flow never gets
 * throttled — they are individually capped by the Google rate limit
 * (a few hundred exchanges per client_id per hour).
 */
export const apiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
})

/** Stricter limiter for payment and order checkout endpoints. */
export const checkoutLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute sliding window
  limit: 120, // 120 creates/verifies per minute = 2/sec — handles burst traffic
  standardHeaders: 'draft-8',
  legacyHeaders: false,
})

/**
 * Stricter limiter for admin-management mutations (create admin, assign
 * roles). Only a few admins exist, so the default is generous.
 */
export const adminMutationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
})

/** Login limiter — throttles admin password guessing attempts. */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
})
