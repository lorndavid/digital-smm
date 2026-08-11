import { SignJWT, jwtVerify } from 'jose'
import { env } from '../../config/env.js'
import { ApiError } from '../../utils/api-error.js'
import type { CustomerAuth, CustomerTokenClaims } from './types.js'

/**
 * Customer session tokens.
 *
 * After a successful Google sign-in we issue our own HS256 JWT signed with
 * CUSTOMER_JWT_SECRET. The `sub` claim is the LOCAL Mongo user id, so every
 * authenticated request maps straight to the database without an external
 * lookup. Tokens are sent as `Authorization: Bearer <jwt>` and verified by
 * `requireAuth`.
 */

const secret = () => new TextEncoder().encode(env.CUSTOMER_JWT_SECRET)

export interface SessionUser {
  id: string
  email: string
  name: string
  avatarUrl: string
  role: string
}

/** Signs a session token for a local user. */
export async function signCustomerToken(user: SessionUser): Promise<string> {
  return new SignJWT({
    email: user.email,
    name: user.name,
    picture: user.avatarUrl,
    role: user.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuer('digitalsmm-customer')
    .setAudience('digitalsmm-frontend')
    .setIssuedAt()
    .setExpirationTime(env.CUSTOMER_JWT_EXPIRES_IN)
    .sign(secret())
}

/** Verifies a customer session token and returns the authenticated identity. */
export async function verifyCustomerToken(token: string): Promise<CustomerAuth> {
  try {
    const { payload } = await jwtVerify(token, secret(), {
      algorithms: ['HS256'],
      issuer: 'digitalsmm-customer',
      audience: 'digitalsmm-frontend',
    })
    if (!payload.sub) {
      throw new Error('Missing sub claim')
    }
    return { userId: payload.sub, claims: payload as CustomerTokenClaims }
  } catch {
    throw new ApiError(401, 'Invalid or expired session token')
  }
}
