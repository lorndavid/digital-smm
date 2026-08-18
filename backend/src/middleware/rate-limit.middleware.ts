import rateLimit from 'express-rate-limit'
import { env } from '../config/env.js'
import { createDistributedStore } from './rate-limit.store.js'

/**
 * Global API limiter.
 *
 * Scaled for 100–300 users behind shared NAT (office / ISP carrier).
 * 3000 requests per 15 min window ≈ 200/hr ≈ 3.3/min per user at
 * peak concurrency. The env variable `RATE_LIMIT_MAX` controls the
 * actual value (default 3000).
 *
 * Stores are Redis-backed (`DistributedRateLimitStore`) so the limit is
 * enforced GLOBALLY across all backend instances sharing a REDIS_URL — a
 * user split across instances by the load balancer still gets one shared
 * quota. Without Redis it transparently falls back to per-instance memory.
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
  store: createDistributedStore('digitalsmm:rl:api:'),
})

/**
 * Storefront catalogue limiter — the public read-only endpoints the landing,
 * dashboard and Explore pages hit on every load (categories, services,
 * announcements). These get a GENEROUS dedicated budget so a busy shop front
 * can never lock its own customers out of browsing, and so catalogue traffic
 * never competes with the stricter global budget that also covers writes.
 * Env: RATE_LIMIT_CATALOGUE_MAX (default 10000 per window).
 */
export const catalogueLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_CATALOGUE_MAX,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  store: createDistributedStore('digitalsmm:rl:catalogue:'),
})

/** Stricter limiter for payment and order checkout endpoints. */
export const checkoutLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute sliding window
  limit: 120, // 120 creates/verifies per minute = 2/sec — handles burst traffic
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  store: createDistributedStore('digitalsmm:rl:checkout:'),
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
  store: createDistributedStore('digitalsmm:rl:admin-mutation:'),
})

/** Login limiter — throttles admin password guessing attempts. */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  store: createDistributedStore('digitalsmm:rl:login:'),
})

/**
 * Integration connection-test limiter — 5 tests per minute per admin so a
 * user can never accidentally hammer an external provider API (Telegram /
 * SMM rate limits are far lower than ours).
 */
export const integrationTestLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  store: createDistributedStore('digitalsmm:rl:integration-test:'),
})
