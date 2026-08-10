/**
 * Customer session storage.
 *
 * After Google sign-in the backend returns a session JWT that we keep in
 * localStorage and send as `Authorization: Bearer <token>` on every request.
 * (Same pattern the admin panel uses for its sessions.)
 */

const TOKEN_KEY = 'digitalsmm_session_token'

/** Returns the stored session token (or null when signed out). */
export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

/** Persists a fresh session token. */
export function storeSessionToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    /* storage unavailable — session simply won't persist across reloads */
  }
}

/** Removes the stored session token. */
export function clearSessionToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* noop */
  }
}
