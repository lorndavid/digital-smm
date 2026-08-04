import type { JWTPayload } from 'jose'

/**
 * Authenticated customer identity attached to `req.auth` by `requireAuth`.
 * `userId` is the LOCAL Mongo user id (not the Google `sub`).
 */
export interface CustomerAuth {
  /** Local Mongo user id (our `users._id`). */
  userId: string
  /** Raw JWT claims from the customer session token. */
  claims: JWTPayload
}

/** Verified profile from Google's id_token / userinfo. */
export interface GoogleUserInfo {
  /** Google account id (`sub`). */
  sub: string
  email: string
  emailVerified: boolean
  name: string
  picture: string
}

/** Claims embedded in our customer session JWT (HS256). */
export interface CustomerTokenClaims extends JWTPayload {
  email?: string
  name?: string
  picture?: string
  role?: string
}

/** Claims embedded in the OAuth `state` token (signed, short-lived). */
export interface OAuthStateClaims extends JWTPayload {
  /** Intended frontend redirect path, e.g. `/dashboard/orders`. */
  r: string
  /** Random nonce. */
  n: string
}
