import { decodeJwt } from 'jose'
import { env } from '../../config/env.js'
import { userRepository } from '../../repositories/user.repository.js'
import { ApiError } from '../../utils/api-error.js'
import {
  buildAuthUrl,
  exchangeCodeForTokens,
  fetchGoogleUserInfo,
  verifyGoogleIdToken,
} from './google.js'
import { signCustomerToken } from './session.js'
import { createStateToken, verifyStateToken } from './state.js'

/**
 * Customer authentication — Google OAuth 2.0 (Authorization Code + PKCE).
 *
 * Flow:
 *   1. The SPA generates a PKCE code_verifier (kept in sessionStorage) and its
 *      S256 challenge, then calls `getGoogleAuthUrl(redirect, challenge)`.
 *      We return the Google consent URL bound to a signed `state` token that
 *      records the intended redirect path (login-CSRF defence).
 *   2. Google redirects back to `${FRONTEND_URL}/auth/callback?code=…&state=…`.
 *   3. The SPA POSTs `{ code, state, code_verifier }` to `exchangeGoogleCode`:
 *      we verify the state, exchange the code server-side (client secret never
 *      leaves the server) with the SPA-held verifier, verify the Google
 *      id_token, upsert the local user and return a customer session JWT.
 */

/** Validates a client-supplied redirect path (must be a same-app path). */
export function sanitizeRedirect(redirect: string | undefined): string {
  if (!redirect || redirect === '/') return '/dashboard'
  // Only allow app-relative paths — never scheme://, //host or backslashes.
  if (!redirect.startsWith('/') || redirect.startsWith('//') || redirect.includes('\\')) {
    return '/dashboard'
  }
  return redirect
}

/** Returns `{ url }` — the Google consent URL the SPA should navigate to. */
export async function getGoogleAuthUrl(redirect: string | undefined, codeChallenge: string): Promise<{ url: string }> {
  const target = sanitizeRedirect(redirect)
  const state = await createStateToken(target)
  const url = await buildAuthUrl(state, codeChallenge)
  return { url }
}

/**
 * Exchanges the Google authorization code for a customer session.
 * Returns `{ token, expiresAt, user, redirect }` or throws a friendly error.
 */
export async function exchangeGoogleCode(code: string, state: string, codeVerifier: string) {
  if (!code || !state || !codeVerifier) {
    throw new ApiError(400, 'Missing authorization details')
  }

  // Verify the state token first — fails closed on tampered/expired states.
  const claims = await verifyStateToken(state)
  const redirect = sanitizeRedirect(claims.r)

  // Exchange the code server-side (single-use at Google) with the PKCE
  // verifier held by the browser that started the flow.
  const tokens = await exchangeCodeForTokens(code, codeVerifier)
  if (!tokens.id_token) {
    throw new ApiError(400, 'Google did not return an identity token')
  }

  // The id_token is the source of truth. Some Workspace domains omit
  // email_verified from it, so fall back to the userinfo endpoint first.
  let profile = await verifyGoogleIdToken(tokens.id_token)
  if (!profile.emailVerified) {
    const userinfo = await fetchGoogleUserInfo(tokens.access_token)
    if (userinfo && userinfo.sub === profile.sub && userinfo.emailVerified) {
      profile = userinfo
    }
  }
  if (!profile.emailVerified) {
    throw new ApiError(400, 'Your Google account has no verified email address')
  }

  // Find-or-create the local user (legacy Clerk-era accounts are adopted by
  // email so orders and wallets are preserved). `isNewUser` lets the
  // frontend fire a real `sign_up` analytics event only when an account was
  // actually created — not on every login.
  const existing = await userRepository.findByProviderId(profile.sub)
  const isNewUser = !existing && !(await userRepository.findOne({ email: profile.email }))
  const user = await userRepository.upsertFromGoogle(profile)
  const token = await signCustomerToken({
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    role: user.role,
  })

  return {
    token,
    expiresAt: sessionExpiry(token),
    user: serializeUser(user),
    redirect,
    isNewUser,
  }
}

/** Computes the token `exp` claim as an ISO string (for the SPA). */
function sessionExpiry(token: string): string {
  const payload = decodeJwt(token)
  const expMs = typeof payload.exp === 'number' ? payload.exp * 1000 : Date.now() + 7 * 24 * 60 * 60 * 1000
  return new Date(expMs).toISOString()
}

function serializeUser(user: {
  _id: { toString(): string }
  email: string
  name: string
  avatarUrl: string
  role: string
  isActive: boolean
}) {
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    role: user.role,
    isActive: user.isActive,
  }
}


