import { defineStore } from 'pinia'
import { ref } from 'vue'
import { authApi, type SessionUser } from '@/api/auth.api'
import { clearSessionToken, storeSessionToken } from '@/api/session'
import { event } from '@/analytics'

/**
 * Customer auth state — backed by the Google OAuth session JWT stored in
 * localStorage (see api/session.ts). Route guards read this store.
 *
 * Lifecycle:
 *   init()   — called once from App.vue; revalidates the stored token against
 *              /api/auth/me so a reload never shows stale state.
 *   signOut()— calls the API, clears the token and resets local state.
 */
export const useAuthStore = defineStore('auth', () => {
  const isLoaded = ref(false)
  const isSignedIn = ref(false)
  const userId = ref<string | null>(null)
  const isAdmin = ref(false)
  const user = ref<SessionUser | null>(null)

  function applyUser(next: SessionUser | null) {
    user.value = next
    isSignedIn.value = Boolean(next)
    userId.value = next?.id ?? null
    isAdmin.value = next?.role === 'admin' || next?.role === 'super_admin'
  }

  /** Rehydrate the session from the stored token (revalidates with the API). */
  async function init(): Promise<void> {
    try {
      const me = await authApi.me()
      applyUser(me)
    } catch {
      applyUser(null)
      clearSessionToken()
    } finally {
      isLoaded.value = true
    }
  }

  /** Called by AuthCallbackView after a successful Google exchange. */
  function setSession(token: string, sessionUser: SessionUser): void {
    storeSessionToken(token)
    applyUser(sessionUser)
    isLoaded.value = true
  }

  /** Ends the session: API call (best effort) + local cleanup. */
  async function signOut(): Promise<void> {
    try {
      await authApi.logout()
    } catch {
      /* the local cleanup below is the source of truth */
    }
    event('logout', { signed_in: false })
    clearSessionToken()
    applyUser(null)
  }

  function reset(): void {
    clearSessionToken()
    applyUser(null)
    isLoaded.value = true
  }

  return {
    isLoaded,
    isSignedIn,
    userId,
    isAdmin,
    user,
    init,
    setSession,
    signOut,
    reset,
  }
})
