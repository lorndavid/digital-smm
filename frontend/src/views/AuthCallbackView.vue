<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AlertCircle, ArrowLeft, Loader2, LogIn } from '@lucide/vue'
import { authApi } from '@/api/auth.api'
import { useAuthStore } from '@/stores/auth.store'
import { takePkceVerifier } from '@/utils/pkce'
import BrandLogo from '@/components/layout/BrandLogo.vue'
import BaseButton from '@/components/ui/BaseButton.vue'

/**
 * Google OAuth redirect target (`/auth/callback`).
 *
 * Google sends the customer here after consent with `?code=…&state=…`.
 * We exchange the code with the backend, store the session JWT and continue
 * to the dashboard (or the page the user originally wanted).
 */
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const state = ref<'working' | 'error' | 'cancelled'>('working')
const error = ref('')

function safeRedirect(path: unknown): string {
  const raw = typeof path === 'string' ? path : ''
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/dashboard'
  return raw
}

onMounted(async () => {
  const code = typeof route.query.code === 'string' ? route.query.code : ''
  const stateParam = typeof route.query.state === 'string' ? route.query.state : ''

  // Google redirects here with ?error=access_denied when the user cancels.
  if (route.query.error) {
    state.value = 'cancelled'
    return
  }

  // Guard: if the URL has no code at this point, the user probably refreshed
  // after a successful exchange. Try the session check instead.
  if (!code || !stateParam) {
    // If the session is already active (the exchange succeeded earlier),
    // skip straight to the dashboard.
    if (authStore.isSignedIn) {
      await router.replace('/dashboard')
      return
    }
    state.value = 'error'
    error.value = 'Missing sign-in details. Please try signing in again.'
    return
  }

  // The PKCE verifier generated when the flow started (kept in sessionStorage,
  // never in a URL). Without it the code cannot be exchanged.
  const verifier = takePkceVerifier()
  if (!verifier) {
    state.value = 'error'
    error.value = 'This sign-in session expired. Please try signing in again.'
    return
  }

  try {
    const result = await authApi.exchangeGoogle(code, stateParam, verifier)
    authStore.setSession(result.token, result.user)
    // Replace the URL to strip the ?code&state params — prevents re-exchange
    // on refresh and avoids leaking auth codes in browser history.
    await router.replace(safeRedirect(result.redirect))
  } catch (err) {
    state.value = 'error'
    error.value =
      err instanceof Error && err.message
        ? err.message
        : 'Could not complete Google sign-in. Please try again.'
  }
})
</script>

<template>
  <div class="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
    <div class="bg-grid pointer-events-none absolute inset-0 opacity-40" />
    <div
      class="animate-gradient pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-gradient-to-r from-brand-600/40 via-brand-500/20 to-secondary-500/30 blur-[110px]"
    />

    <div class="relative w-full max-w-md">
      <div class="flex justify-center">
        <BrandLogo />
      </div>

      <div class="glass-strong mt-6 rounded-2xl p-6 text-center shadow-glow sm:p-7">
        <!-- Working -->
        <template v-if="state === 'working'">
          <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-500/15">
            <Loader2 class="h-8 w-8 animate-spin text-brand-300" />
          </div>
          <h1 class="font-display mt-6 text-xl font-bold text-ink">Completing sign-in…</h1>
          <p class="mt-2 text-sm text-ink/50">
            Securely connecting your Google account.
          </p>
        </template>

        <!-- Cancelled at Google -->
        <template v-else-if="state === 'cancelled'">
          <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/15">
            <AlertCircle class="h-8 w-8 text-amber-300" />
          </div>
          <h1 class="font-display mt-6 text-xl font-bold text-ink">Sign-in cancelled</h1>
          <p class="mt-2 text-sm text-ink/50">No worries — nothing was changed.</p>
          <BaseButton class="mt-6" variant="secondary" @click="router.push({ name: 'sign-in' })">
            <ArrowLeft class="h-4 w-4" /> Back to sign in
          </BaseButton>
        </template>

        <!-- Error -->
        <template v-else>
          <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/15">
            <AlertCircle class="h-8 w-8 text-rose-300" />
          </div>
          <h1 class="font-display mt-6 text-xl font-bold text-ink">Sign-in failed</h1>
          <p class="mt-2 text-sm text-ink/50">{{ error }}</p>
          <div class="mt-6 flex justify-center gap-3">
            <BaseButton variant="outline" @click="router.push('/')">
              <ArrowLeft class="h-4 w-4" /> Home
            </BaseButton>
            <BaseButton variant="secondary" @click="router.push({ name: 'sign-in' })">
              <LogIn class="h-4 w-4" /> Try again
            </BaseButton>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
