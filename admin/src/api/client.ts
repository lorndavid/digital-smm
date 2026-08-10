import axios, { AxiosError } from 'axios'

const TOKEN_KEY = 'digitalsmm_admin_token'
const baseURL = import.meta.env.VITE_API_BASE_URL || '/api'

export function getAdminToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export const apiClient = axios.create({
  baseURL,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
})

apiClient.interceptors.request.use((config) => {
  const token = getAdminToken()
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

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ error?: string; details?: unknown }>) => {
    const status = error.response?.status
    const message = error.response?.data?.error ?? error.message ?? 'Something went wrong'
    return Promise.reject(new ApiRequestError(message, status, error.response?.data?.details))
  },
)
