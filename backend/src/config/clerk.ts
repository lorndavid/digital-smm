import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'
import { env } from './env.js'
import { ApiError } from '../utils/api-error.js'

/**
 * Clerk session verification.
 *
 * Clerk issues RS256 JWTs signed with a key exposed at
 * `https://<frontend-api>/.well-known/jwks.json`. We verify tokens with
 * `jose` using a cached remote JWKS set — no secret key required.
 */

const JWKS = createRemoteJWKSet(new URL(env.CLERK_JWKS_URL))

export interface ClerkAuth {
  /** Clerk user id (`sub` claim) */
  userId: string
  /** Clerk session id (`sid` claim) */
  sessionId?: string
  /** Raw JWT claims, including any custom session token claims. */
  claims: JWTPayload
}

/** Verifies a Clerk session JWT and returns the authenticated identity. */
export async function verifyClerkToken(token: string): Promise<ClerkAuth> {
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      algorithms: ['RS256'],
      issuer: env.CLERK_ISSUER || undefined,
    })
    if (!payload.sub) {
      throw new Error('Missing sub claim')
    }
    return {
      userId: payload.sub,
      sessionId: typeof payload.sid === 'string' ? payload.sid : undefined,
      claims: payload,
    }
  } catch {
    throw new ApiError(401, 'Invalid or expired session token')
  }
}
