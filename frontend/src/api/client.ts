import axios, { AxiosError } from 'axios'
import { getAuthToken } from './clerkToken'

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api'

export const apiClient = axios.create({
  baseURL,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
})

/** Attaches the Clerk session JWT to every request. */
apiClient.interceptors.request.use(async (config) => {
  const token = await getAuthToken()
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
      // expired (token rejected). Show a friendly message and bounce them to
      // the sign-in page instead of leaking a raw "Missing session token".
      message = hadToken
        ? 'Your session has expired — please sign in again'
        : 'Please sign in to continue'
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/sign-in')) {
        const redirect = encodeURIComponent(window.location.pathname + window.location.search)
        window.location.assign(`/sign-in?redirect=${redirect}`)
      }
    }
    return Promise.reject(new ApiRequestError(message, status, error.response?.data?.details))
  },
)
