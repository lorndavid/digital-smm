import { createRemoteJWKSet, jwtVerify } from 'jose'
import { env } from '../../config/env.js'
import { ApiError } from '../../utils/api-error.js'
import { logger } from '../../utils/logger.js'
import type { GoogleUserInfo } from './types.js'

/**
 * Google OAuth 2.0 client — Authorization Code + PKCE.
 *
 * No SDK required: token exchange uses Node's global `fetch`, the Google
 * id_token is verified against Google's public JWKS with `jose`. The Google
 * client secret never leaves the server. The PKCE code_verifier is generated
 * by the SPA (sessionStorage) and supplied to the exchange — never in a URL.
 */

/** The frontend URL Google sends the customer back to after consent. */
export function googleRedirectUri(): string {
  return `${env.FRONTEND_URL.replace(/\/$/, '')}/auth/callback`
}

/**
 * Builds the Google consent URL for a given state token + S256 code_challenge
 * (the challenge was derived from the SPA-held code_verifier).
 */
export async function buildAuthUrl(state: string, codeChallenge: string): Promise<string> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new ApiError(
      503,
      'Google sign-in is not configured — add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to backend/.env',
    )
  }
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: googleRedirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  })
  return `${env.GOOGLE_OAUTH_URL}?${params.toString()}`
}

interface TokenResponse {
  access_token: string
  id_token?: string
  token_type: string
  expires_in: number
}

/**
 * Exchanges the authorization code for tokens using the PKCE verifier.
 * The code is single-use — a replay fails at Google.
 */
export async function exchangeCodeForTokens(code: string, verifier: string): Promise<TokenResponse> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new ApiError(
      503,
      'Google sign-in is not configured — add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to backend/.env',
    )
  }
  let res: Response
  try {
    res = await fetch(env.GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: googleRedirectUri(),
        grant_type: 'authorization_code',
        code_verifier: verifier,
      }),
    })
  } catch {
    throw new ApiError(502, 'Could not reach Google — please try again')
  }

  if (!res.ok) {
    // Google rejects bad/missing verifiers, expired codes, etc.
    throw new ApiError(400, 'Google rejected the sign-in request — please try again')
  }
  return (await res.json()) as TokenResponse
}

// Lazy JWKS — no network happens until the first id_token verification.
let googleJwks: ReturnType<typeof createRemoteJWKSet> | null = null
function jwks() {
  googleJwks ??= createRemoteJWKSet(new URL(env.GOOGLE_CERTS_URL))
  return googleJwks
}

/**
 * Verifies the Google id_token (signature + issuer + audience) and extracts
 * the profile claims. Signature/issuer/audience checks are the hard gate;
 * `emailVerified` is reported to the caller, which may fall back to the
 * userinfo endpoint for accounts that omit it in the id_token.
 *
 * Clock tolerance (5 min) is enabled so a slightly-skewed machine clock
 * won't reject valid tokens. The real reason is logged server-side so you
 * can diagnose without leaking details to the client.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleUserInfo> {
  let payload: { sub?: string; email?: string; email_verified?: boolean; name?: string; picture?: string }
  try {
    const result = await jwtVerify(idToken, jwks(), {
      algorithms: ['RS256'],
      audience: env.GOOGLE_CLIENT_ID,
      issuer: ['accounts.google.com', 'https://accounts.google.com'],
      clockTolerance: 300, // 5 minutes — handles modest clock skew
    })
    payload = result.payload as typeof payload
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown'
    logger.warn(`[google] id_token verification failed: ${reason}`)
    throw new ApiError(401, 'Could not verify Google sign-in')
  }

  if (!payload.sub || !payload.email) {
    logger.warn(`[google] id_token missing sub/email: sub=${Boolean(payload.sub)} email=${Boolean(payload.email)}`)
    throw new ApiError(400, 'Your Google account is missing an email address')
  }

  return {
    sub: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified === true,
    name: payload.name ?? '',
    picture: payload.picture ?? '',
  }
}

/**
 * Fetches the profile from Google's userinfo endpoint (fallback when the
 * id_token doesn't assert email verification, e.g. some Workspace domains).
 */
export async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo | null> {
  let res: Response
  try {
    res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  } catch {
    return null
  }
  if (!res.ok) return null
  const body = (await res.json()) as {
    sub?: string
    email?: string
    email_verified?: boolean
    name?: string
    picture?: string
  }
  if (!body.sub || !body.email) return null
  return {
    sub: body.sub,
    email: body.email,
    emailVerified: body.email_verified === true,
    name: body.name ?? '',
    picture: body.picture ?? '',
  }
}
