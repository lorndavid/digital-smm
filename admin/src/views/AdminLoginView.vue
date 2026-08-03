<script setup lang="ts">
import { ref } from 'vue'
import { useSignIn } from '@clerk/vue'
import { Globe, ShieldCheck } from '@lucide/vue'
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
      redirectUrl: '/login',
      redirectUrlComplete: '/',
    })
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Unable to start Google sign-in'
  }
}
</script>

<template>
  <div class="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
    <div class="bg-grid pointer-events-none absolute inset-0 opacity-40" />
    <div class="pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-gradient-to-r from-brand-600/40 via-brand-500/20 to-secondary-500/30 blur-[110px]" />

    <div class="relative w-full max-w-md">
      <div class="glass-strong rounded-3xl p-8 shadow-glow sm:p-10">
        <div class="flex flex-col items-center text-center">
          <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-secondary-500 shadow-glow">
            <ShieldCheck class="h-7 w-7 text-white" />
          </div>
          <h1 class="font-display mt-5 text-2xl font-bold text-white">VidSMM Admin</h1>
          <p class="mt-2 text-sm text-white/50">
            Restricted area. Sign in with your Google account to continue.
          </p>
        </div>

        <div v-if="!publishableKey" class="mt-8 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-5 text-center">
          <p class="text-sm font-medium text-amber-200">Clerk is not configured</p>
          <p class="mt-1 text-xs leading-relaxed text-amber-200/70">
            Add <code class="rounded bg-white/10 px-1.5 py-0.5">VITE_CLERK_PUBLISHABLE_KEY</code> to admin/.env.
          </p>
        </div>

        <div v-else class="mt-8">
          <BaseButton size="lg" block variant="outline" :loading="isLoaded === false" @click="continueWithGoogle">
            <Globe class="h-5 w-5 text-secondary-400" /> Continue with Google
          </BaseButton>
        </div>

        <p v-if="error" class="mt-4 text-center text-sm text-rose-300">{{ error }}</p>
      </div>
    </div>
  </div>
</template>
