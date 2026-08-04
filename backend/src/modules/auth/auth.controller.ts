import { userRepository } from '../../repositories/user.repository.js'
import { asyncHandler } from '../../utils/async-handler.js'
import { ApiError } from '../../utils/api-error.js'
import { validate, validateQuery } from '../../middleware/validate.middleware.js'
import { requireAuth } from '../../middleware/auth.middleware.js'
import { googleExchangeBodySchema, googleUrlBodySchema } from '../../validators/index.js'
import { exchangeGoogleCode, getGoogleAuthUrl } from './auth.service.js'

export const authController = {
  /**
   * POST /api/auth/google/url { redirect?, codeChallenge }
   * Returns the Google consent URL. The SPA supplies the S256 PKCE challenge
   * derived from its sessionStorage-held verifier. Unauthenticated (rate-limited).
   */
  googleUrl: [
    validate(googleUrlBodySchema),
    asyncHandler(async (req, res) => {
      const { redirect, codeChallenge } = req.body
      res.json(await getGoogleAuthUrl(redirect, codeChallenge))
    }),
  ],

  /**
   * POST /api/auth/google/exchange { code, state, codeVerifier }
   * Verifies the OAuth state, exchanges the code server-side with the
   * SPA-held PKCE verifier, upserts the user and returns
   * `{ token, expiresAt, user, redirect }`.
   */
  exchange: [
    validate(googleExchangeBodySchema),
    asyncHandler(async (req, res) => {
      const { code, state, codeVerifier } = req.body
      res.json(await exchangeGoogleCode(code, state, codeVerifier))
    }),
  ],

  /**
   * GET /api/auth/me
   * Returns the current session user (rehydrates the SPA on boot).
   */
  me: [
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.auth) throw new ApiError(401, 'Unauthorized')
      const user = await userRepository.findById(req.auth.userId)
      if (!user || !user.isActive) {
        throw new ApiError(401, 'Account disabled or not found')
      }
      res.json({
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        role: user.role,
        isActive: user.isActive,
      })
    }),
  ],

  /**
   * POST /api/auth/logout
   * Stateless for bearer tokens — the client discards the token. Kept for
   * symmetry and future httpOnly-cookie sessions.
   */
  logout: [
    requireAuth,
    asyncHandler(async (_req, res) => {
      res.json({ ok: true })
    }),
  ],
}
