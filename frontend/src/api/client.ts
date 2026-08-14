import axios, { AxiosError } from 'axios'
import { getAuthToken } from './session'

// VITE_API_BASE_URL may be the bare host (https://api.digitalsmm.shop) or
// already include /api. The app's request paths never carry the /api
// prefix, so normalize it here: append /api unless it's already there.
const rawBase = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '')
const baseURL = rawBase && !rawBase.endsWith('/api') ? `${rawBase}/api` : rawBase || '/api'

export const apiClient = axios.create({
  baseURL,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
})

/** Attaches the customer session JWT to every request. */
apiClient.interceptors.request.use((config) => {
  const token = getAuthToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export class ApiRequestError extends Error {
  status?: number
  details?: unknown

  constructor(message: string, status?: number, details?: unknown) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.details = details
  }
}

/** Normalizes backend/network errors into a friendly ApiRequestError. */
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ error?: string; details?: unknown }>) => {
    const status = error.response?.status
    const hadToken = Boolean(error.config?.headers?.Authorization)
    let message = error.response?.data?.error ?? error.message ?? 'Something went wrong'

    if (status === 401) {
      // A 401 means the user isn't signed in (no token sent) or the session
      // expired (token rejected). Show a friendly message instead of leaking
      // a raw "Missing session token".
      //
      // IMPORTANT: we must NOT hard-redirect here for these cases — they are
      // handled gracefully by the caller / router guard:
      //   • /auth/me  — the boot-time session check in authStore.init(). A
      //     guest who just opened the landing page has no token, gets a 401,
      //     and would otherwise be force-bounced to /sign-in. init() treats
      //     the 401 as "not signed in" and the landing page stays visible.
      //   • /auth/logout — signing out with an expired token should not
      //     bounce the user mid-sign-out.
      // We only redirect when a REAL session existed but was rejected
      // (hadToken && !isSessionCheck), i.e. the session expired mid-use.
      const url = typeof error.config?.url === 'string' ? error.config.url : ''
      const isLogout = url.includes('/auth/logout')
      const isSessionCheck = url.includes('/auth/me')
      message = hadToken && !isLogout
        ? 'Your session has expired — please sign in again'
        : isLogout
          ? 'Signed out'
          : 'Please sign in to continue'
      if (
        hadToken &&
        !isLogout &&
        !isSessionCheck &&
        typeof window !== 'undefined' &&
        !window.location.pathname.startsWith('/sign-in')
      ) {
        const redirect = encodeURIComponent(window.location.pathname + window.location.search)
        window.location.assign(`/sign-in?redirect=${redirect}`)
      }
    }
    return Promise.reject(new ApiRequestError(message, status, error.response?.data?.details))
  },
)
