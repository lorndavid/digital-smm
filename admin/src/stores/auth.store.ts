import { defineStore } from 'pinia'
import { ref } from 'vue'
import { adminApi } from '@/api/admin.api'

/**
 * Admin auth — MongoDB-backed email + password sessions.
 * The JWT is persisted in localStorage; /admin/auth/me revalidates it on boot.
 */

const TOKEN_KEY = 'vidsmm_admin_token'

export interface AdminIdentity {
  id: string
  email: string
  name: string
  role: 'admin' | 'super_admin'
}

export const useAuthStore = defineStore('auth', () => {
  const isLoaded = ref(false)
  const isSignedIn = ref(false)
  const userId = ref<string | null>(null)
  const isAdmin = ref(false)
  const isSuperAdmin = ref(false)
  const admin = ref<AdminIdentity | null>(null)

  function applyIdentity(identity: AdminIdentity | null) {
    admin.value = identity
    isSignedIn.value = Boolean(identity)
    userId.value = identity?.id ?? null
    isAdmin.value = Boolean(identity)
    isSuperAdmin.value = identity?.role === 'super_admin'
    isLoaded.value = true
  }

  /** Rehydrate the session from localStorage and revalidate with the API. */
  async function restore(): Promise<void> {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) {
      applyIdentity(null)
      return
    }
    try {
      const identity = await adminApi.me()
      applyIdentity(identity)
    } catch {
      localStorage.removeItem(TOKEN_KEY)
      applyIdentity(null)
    }
  }

  async function login(email: string, password: string): Promise<AdminIdentity> {
    const result = await adminApi.login(email, password)
    localStorage.setItem(TOKEN_KEY, result.token)
    applyIdentity(result.admin)
    return result.admin
  }

  function logout(): void {
    localStorage.removeItem(TOKEN_KEY)
    applyIdentity(null)
  }

  return { isLoaded, isSignedIn, userId, isAdmin, isSuperAdmin, admin, restore, login, logout }
})
