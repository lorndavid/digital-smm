import { apiClient } from './client'

export interface SessionUser {
  id: string
  email: string
  name: string
  avatarUrl: string
  role: string
  isActive: boolean
}

export interface ExchangeResult {
  token: string
  expiresAt: string
  user: SessionUser
  redirect: string
}

/** Customer auth endpoints (Google OAuth 2.0 + PKCE). */
export const authApi = {
  /**
   * Returns `{ url }` — the Google consent URL. The SPA supplies the S256
   * PKCE challenge (derived from its sessionStorage-held verifier), then
   * navigates to the URL; Google sends the customer back to
   * `/auth/callback?code=...&state=...`.
   */
  async getGoogleAuthUrl(redirect: string | undefined, codeChallenge: string): Promise<{ url: string }> {
    const { data } = await apiClient.post<{ url: string }>('/auth/google/url', {
      redirect: redirect && redirect !== '/' ? redirect : undefined,
      codeChallenge,
    })
    return data
  },

  /** Exchanges the Google authorization code for a session token. */
  async exchangeGoogle(code: string, state: string, codeVerifier: string): Promise<ExchangeResult> {
    const { data } = await apiClient.post<ExchangeResult>('/auth/google/exchange', {
      code,
      state,
      codeVerifier,
    })
    return data
  },

  /** Returns the current session user (rehydration on boot). */
  async me(): Promise<SessionUser> {
    const { data } = await apiClient.get<SessionUser>('/auth/me')
    return data
  },

  /** Ends the session server-side (client also clears its token). */
  async logout(): Promise<void> {
    await apiClient.post('/auth/logout')
  },
}
