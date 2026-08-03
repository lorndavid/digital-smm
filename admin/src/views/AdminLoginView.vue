<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { KeyRound, Mail, ShieldCheck } from '@lucide/vue'
import { useAuthStore } from '@/stores/auth.store'
import { errorMessage } from '@/utils/format'
import BaseButton from '@/components/ui/BaseButton.vue'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const email = ref('')
const password = ref('')
const error = ref('')
const submitting = ref(false)

async function submit(): Promise<void> {
  error.value = ''
  if (!email.value.trim() || !password.value) {
    error.value = 'Enter your email and password'
    return
  }
  submitting.value = true
  try {
    await authStore.login(email.value.trim(), password.value)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    await router.push(redirect)
  } catch (err) {
    error.value = errorMessage(err, 'Sign-in failed')
  } finally {
    submitting.value = false
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
            <ShieldCheck class="h-7 w-7 text-(--a-text)" />
          </div>
          <h1 class="font-display mt-5 text-2xl font-bold text-(--a-text)">VidSMM Admin</h1>
          <p class="mt-2 text-sm text-(--a-muted)">
            Restricted area — sign in with your admin email and password.
          </p>
        </div>

        <form class="mt-8 space-y-4" @submit.prevent="submit">
          <div class="relative">
            <Mail class="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-(--a-muted-3)" />
            <input
              v-model="email"
              type="email"
              required
              autocomplete="username"
              placeholder="admin@example.com"
              class="h-11 w-full rounded-xl border border-(--a-border) bg-(--a-soft) pl-11 pr-4 text-sm text-(--a-text) placeholder:text-(--a-muted-3) focus:border-brand-400/60 focus:outline-none focus:ring-2 focus:ring-brand-400/30"
            />
          </div>
          <div class="relative">
            <KeyRound class="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-(--a-muted-3)" />
            <input
              v-model="password"
              type="password"
              required
              autocomplete="current-password"
              placeholder="Password"
              class="h-11 w-full rounded-xl border border-(--a-border) bg-(--a-soft) pl-11 pr-4 text-sm text-(--a-text) placeholder:text-(--a-muted-3) focus:border-brand-400/60 focus:outline-none focus:ring-2 focus:ring-brand-400/30"
            />
          </div>

          <p v-if="error" class="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-2.5 text-sm text-rose-300">
            {{ error }}
          </p>

          <BaseButton type="submit" size="lg" block :loading="submitting">
            <KeyRound class="h-4 w-4" /> Sign in
          </BaseButton>
        </form>
      </div>
    </div>
  </div>
</template>
