<script setup lang="ts">
import { ref } from 'vue'
import { useSignIn } from '@clerk/vue'
import { Globe, ShieldCheck, Sparkles, Zap } from '@lucide/vue'
import BrandLogo from '@/components/layout/BrandLogo.vue'
import BaseButton from '@/components/ui/BaseButton.vue'

const { isLoaded, signIn } = useSignIn()
const error = ref('')
const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

async function continueWithGoogle(): Promise<void> {
  if (!signIn.value) return
  error.value = ''
  try {
    await signIn.value.authenticateWithRedirect({
      strategy: 'oauth_google',
      redirectUrl: '/sign-in',
      redirectUrlComplete: '/dashboard',
    })
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Unable to start Google sign-in'
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

        <div v-if="!publishableKey" class="mt-8 w-full rounded-2xl border border-amber-400/30 bg-amber-400/10 p-5 text-center">
          <p class="text-sm font-medium text-amber-200">Clerk is not configured</p>
          <p class="mt-1 text-xs leading-relaxed text-amber-200/70">
            Add <code class="rounded bg-white/10 px-1.5 py-0.5">VITE_CLERK_PUBLISHABLE_KEY</code>
            to <code class="rounded bg-white/10 px-1.5 py-0.5">frontend/.env</code> to enable
            Google sign-in.
          </p>
        </div>

        <div v-else class="mt-8 w-full space-y-4">
          <BaseButton
            size="lg"
            block
            variant="outline"
            :loading="isLoaded === false"
            @click="continueWithGoogle"
          >
            <Globe class="h-5 w-5 text-secondary-400" />
            Continue with Google
          </BaseButton>
          <p class="text-center text-xs text-white/35">
            By continuing you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>

        <p v-if="error" class="mt-4 text-sm text-rose-300">{{ error }}</p>
      </div>
    </div>
  </div>
</template>
