import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * Auth state synced from Clerk (see useClerkSession). Route guards read
 * this store so they never depend on Clerk's composable context.
 */
export const useAuthStore = defineStore('auth', () => {
  const isLoaded = ref(false)
  const isSignedIn = ref(false)
  const userId = ref<string | null>(null)
  const isAdmin = ref(false)

  function setLoaded(loaded: boolean, signedIn: boolean) {
    isLoaded.value = loaded
    isSignedIn.value = signedIn
    if (!signedIn) {
      userId.value = null
      isAdmin.value = false
    }
  }

  function setAuth(loaded: boolean, signedIn: boolean, id: string | null, admin: boolean) {
    isLoaded.value = loaded
    isSignedIn.value = signedIn
    userId.value = id
    isAdmin.value = admin
  }

  function reset() {
    isLoaded.value = true
    isSignedIn.value = false
    userId.value = null
    isAdmin.value = false
  }

  return { isLoaded, isSignedIn, userId, isAdmin, setLoaded, setAuth, reset }
})
