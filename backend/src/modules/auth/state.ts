import { SignJWT, jwtVerify } from 'jose'
import { env } from '../../config/env.js'
import { ApiError } from '../../utils/api-error.js'
import type { OAuthStateClaims } from './types.js'

/**
 * OAuth `state` tokens — the login-CSRF defence.
 *
 * A short-lived signed JWT that records the intended frontend redirect path.
 * The PKCE code_verifier is generated CLIENT-SIDE and held in the SPA's
 * sessionStorage (never sent through a URL), so the Google authorization
 * code can only be exchanged by the browser that started the flow.
 */
const secret = () => new TextEncoder().encode(env.CUSTOMER_JWT_SECRET)
const TTL_SECONDS = env.OAUTH_STATE_TTL_SECONDS

/** Signs a state token carrying the redirect path. */
export async function createStateToken(redirect: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const nonce = crypto.randomUUID()
  return new SignJWT({ r: redirect, n: nonce })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(now + TTL_SECONDS)
    .sign(secret())
}

/**
 * Verifies a state token and returns its claims.
 * Rejects tampered, expired or malformed tokens (HTTP 400).
 */
export async function verifyStateToken(state: string): Promise<OAuthStateClaims> {
  try {
    const { payload } = await jwtVerify(state, secret(), { algorithms: ['HS256'] })
    if (typeof payload.r !== 'string') {
      throw new Error('Missing state claims')
    }
    return payload as unknown as OAuthStateClaims
  } catch {
    throw new ApiError(400, 'Invalid or expired OAuth state')
  }
}
