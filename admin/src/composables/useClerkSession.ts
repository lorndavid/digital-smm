import { watchEffect } from 'vue'
import { useAuth } from '@clerk/vue'
import { registerTokenGetter } from '@/api/clerkToken'
import { useAuthStore } from '@/stores/auth.store'

/** Bridges Clerk auth state into the Pinia auth store (call in App.vue). */
export function useClerkSession(): void {
  const authStore = useAuthStore()
  const { isLoaded, isSignedIn, userId, sessionClaims, getToken } = useAuth()

  registerTokenGetter(async () => {
    if (!isSignedIn.value) return null
    try {
      const token = await getToken.value()
      return token ?? null
    } catch {
      return null
    }
  })

  watchEffect(() => {
    const claims = (sessionClaims.value ?? {}) as Record<string, unknown>
    const metadata = (claims.metadata ?? {}) as Record<string, unknown>
    const role = (claims.role ?? metadata.role ?? claims.orgRole ?? '') as string
    authStore.setAuth(
      Boolean(isLoaded.value),
      Boolean(isSignedIn.value),
      userId.value ?? null,
      role === 'admin',
    )
  })
}
