<script setup lang="ts">
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import { Globe, ShieldCheck, Sparkles, Zap } from '@lucide/vue'
import { authApi } from '@/api/auth.api'
import { createPkcePair } from '@/utils/pkce'
import BrandLogo from '@/components/layout/BrandLogo.vue'
import BaseButton from '@/components/ui/BaseButton.vue'

const route = useRoute()
const starting = ref(false)
const error = ref('')

async function continueWithGoogle(): Promise<void> {
  if (starting.value) return
  starting.value = true
  error.value = ''
  try {
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : undefined
    // PKCE: the verifier is kept in sessionStorage (never in a URL); the
    // backend signs a `state` token, so the whole round-trip is protected
    // against both login CSRF and authorization-code interception.
    const { challenge } = await createPkcePair()
    const { url } = await authApi.getGoogleAuthUrl(redirect, challenge)
    // Full-page navigation to Google.
    window.location.href = url
  } catch (err) {
    starting.value = false
    const message = err instanceof Error ? err.message : 'Unable to start Google sign-in'
    error.value = message.includes('not configured')
      ? 'Google sign-in is not configured yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to backend/.env and restart the backend.'
      : message
  }
}
</script>

<template>
  <div class="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
    <div class="bg-grid pointer-events-none absolute inset-0 opacity-40" />
    <div
      class="animate-gradient pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-gradient-to-r from-brand-600/40 via-brand-500/20 to-secondary-500/30 blur-[110px]"
    />

    <div class="relative grid w-full max-w-4xl overflow-hidden rounded-3xl glass-strong shadow-glow lg:grid-cols-2">
      <!-- Brand panel -->
      <div class="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-600/40 to-night-soft/40 p-10 lg:flex">
        <div class="bg-grid pointer-events-none absolute inset-0 opacity-30" />
        <div class="relative">
          <BrandLogo />
        </div>
        <div class="relative">
          <h2 class="font-display text-2xl font-bold text-white">
            The smartest way to <span class="text-gradient">grow in Cambodia</span>
          </h2>
          <ul class="mt-6 space-y-3 text-sm text-white/70">
            <li class="flex items-center gap-2.5">
              <Zap class="h-4 w-4 text-secondary-400" /> Instant delivery on 500+ services
            </li>
            <li class="flex items-center gap-2.5">
              <ShieldCheck class="h-4 w-4 text-secondary-400" /> Secure Bakong KHQR payments
            </li>
            <li class="flex items-center gap-2.5">
              <Sparkles class="h-4 w-4 text-secondary-400" /> Refills &amp; real-time tracking
            </li>
          </ul>
        </div>
      </div>

      <!-- Sign-in card -->
      <div class="flex flex-col items-center justify-center p-8 sm:p-12">
        <div class="lg:hidden">
          <BrandLogo size="lg" />
        </div>

        <h1 class="font-display mt-8 text-2xl font-bold text-white lg:mt-0">Welcome back</h1>
        <p class="mt-2 text-center text-sm text-white/50">
          Sign in with Google to access your dashboard, orders and wallet.
        </p>

        <div class="mt-8 w-full space-y-4">
          <BaseButton size="lg" block variant="outline" :loading="starting" @click="continueWithGoogle">
            <Globe class="h-5 w-5 text-secondary-400" />
            Continue with Google
          </BaseButton>
          <p class="text-center text-xs text-white/35">
            By continuing you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>

        <p v-if="error" class="mt-4 w-full rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-center text-sm text-rose-300">
          {{ error }}
        </p>
      </div>
    </div>
  </div>
</template>
