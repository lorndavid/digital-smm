<script setup lang="ts">
import { useRouter } from 'vue-router'
import {
  ArrowRight,
  CheckCircle2,
  Heart,
  LogOut,
  Play,
  ShieldCheck,
  TrendingUp,
  Users,
} from '@lucide/vue'
import { useAuthStore } from '@/stores/auth.store'
import BaseButton from '@/components/ui/BaseButton.vue'

const router = useRouter()
const authStore = useAuthStore()

async function onSignOut(): Promise<void> {
  await authStore.signOut()
  router.push('/')
}
</script>

<template>
  <section id="home" class="relative overflow-hidden pt-32 pb-20 sm:pt-40 sm:pb-28">
    <!-- Ambient background -->
    <div class="bg-grid pointer-events-none absolute inset-0 opacity-40 dark:opacity-60" />
    <div
      class="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[760px] -translate-x-1/2 rounded-full bg-gradient-to-r from-brand-500/15 via-brand-400/10 to-secondary-500/15 blur-[120px] dark:from-brand-600/40 dark:via-brand-500/25 dark:to-secondary-500/30"
    />

    <div class="relative mx-auto grid max-w-7xl items-center gap-16 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
      <!-- Copy -->
      <div>
        <div
          v-motion
          :initial="{ opacity: 0, y: 24 }"
          :visible="{ opacity: 1, y: 0, transition: { duration: 0.5 } }"
          class="glass mb-6 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium text-ink/75"
        >
          <span class="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-brand-500 to-secondary-500" />
          🇰🇭 The #1 Cambodia Social Media Marketing Platform
        </div>

        <h1
          v-motion
          :initial="{ opacity: 0, y: 24 }"
          :visible="{ opacity: 1, y: 0, transition: { duration: 0.55, delay: 0.05 } }"
          class="font-display text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl"
        >
          Grow your social media
          <span class="text-gradient">faster than ever</span>
        </h1>

        <p
          v-motion
          :initial="{ opacity: 0, y: 24 }"
          :visible="{ opacity: 1, y: 0, transition: { duration: 0.55, delay: 0.12 } }"
          class="mt-6 max-w-xl text-base leading-relaxed text-ink/60 sm:text-lg"
        >
          Buy real TikTok, Facebook, Instagram, YouTube and Telegram growth with instant
          delivery, real-time tracking and secure KHQR wallet top-ups — trusted by creators
          and agencies across Cambodia.
        </p>

        <div
          v-motion
          :initial="{ opacity: 0, y: 24 }"
          :visible="{ opacity: 1, y: 0, transition: { duration: 0.55, delay: 0.2 } }"
          class="mt-8 flex flex-wrap items-center gap-4"
        >
          <template v-if="authStore.isLoaded">
            <template v-if="authStore.isSignedIn">
              <BaseButton size="lg" @click="router.push('/dashboard')">
                Go to Dashboard <ArrowRight class="h-4 w-4" />
              </BaseButton>
              <BaseButton size="lg" variant="outline" @click="onSignOut">
                <LogOut class="h-4 w-4" /> Sign Out
              </BaseButton>
            </template>
            <template v-else>
              <BaseButton size="lg" @click="router.push('/sign-in')">
                Start Now <ArrowRight class="h-4 w-4" />
              </BaseButton>
              <BaseButton size="lg" variant="outline" @click="router.push('/sign-in')">
                Explore Services
              </BaseButton>
            </template>
          </template>
        </div>

        <div
          v-motion
          :initial="{ opacity: 0, y: 24 }"
          :visible="{ opacity: 1, y: 0, transition: { duration: 0.55, delay: 0.28 } }"
          class="mt-10 grid max-w-md grid-cols-3 gap-4"
        >
          <div>
            <p class="font-display text-2xl font-bold text-ink">12K+</p>
            <p class="mt-1 text-xs text-ink/50">Trusted Users</p>
          </div>
          <div>
            <p class="font-display text-2xl font-bold text-ink">850K+</p>
            <p class="mt-1 text-xs text-ink/50">Orders Completed</p>
          </div>
          <div>
            <p class="font-display text-2xl font-bold text-ink">&lt; 30 min</p>
            <p class="mt-1 text-xs text-ink/50">Fast Delivery</p>
          </div>
        </div>
      </div>

      <!-- Illustration -->
      <div class="relative mx-auto w-full max-w-md lg:max-w-none">
        <div
          v-motion
          :initial="{ opacity: 0, scale: 0.94 }"
          :visible="{ opacity: 1, scale: 1, transition: { duration: 0.6, delay: 0.15 } }"
          class="glass-strong relative rounded-3xl p-6 shadow-card ring-1 ring-line"
        >
          <div class="flex items-center justify-between">
            <div>
              <p class="text-xs text-ink/50">Live order activity</p>
              <p class="font-display text-2xl font-bold text-ink">2 active orders</p>
            </div>
            <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-secondary-500 shadow-glow">
              <TrendingUp class="h-6 w-6 text-white" />
            </div>
          </div>

          <div class="mt-6 space-y-3">
            <div class="flex items-center justify-between rounded-xl bg-soft px-4 py-3">
              <div class="flex items-center gap-3">
                <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-fuchsia-500/15 text-fuchsia-600 dark:bg-fuchsia-500/20 dark:text-fuchsia-300"><Play class="h-4 w-4" fill="currentColor" /></div>
                <div>
                  <p class="text-sm font-medium text-ink">TikTok Followers</p>
                  <p class="text-xs text-ink/40">2,500 · In progress</p>
                </div>
              </div>
              <span class="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 ring-1 ring-inset ring-emerald-500/25 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/30">+250</span>
            </div>
            <div class="flex items-center justify-between rounded-xl bg-soft px-4 py-3">
              <div class="flex items-center gap-3">
                <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/15 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300"><Users class="h-4 w-4" /></div>
                <div>
                  <p class="text-sm font-medium text-ink">Facebook Likes</p>
                  <p class="text-xs text-ink/40">1,000 · Completed</p>
                </div>
              </div>
              <span class="rounded-full bg-sky-500/10 px-2.5 py-1 text-xs font-medium text-sky-600 ring-1 ring-inset ring-sky-500/25 dark:bg-sky-400/10 dark:text-sky-300 dark:ring-sky-400/30">Done</span>
            </div>
          </div>

          <!-- Floating cards -->
          <div class="animate-float absolute -left-6 -top-6 hidden rounded-2xl glass-strong p-3 shadow-glow sm:block">
            <div class="flex items-center gap-2">
              <Heart class="h-4 w-4 text-rose-500 dark:text-rose-400" fill="currentColor" />
              <span class="text-xs font-semibold text-ink">+1,200</span>
            </div>
          </div>
          <div class="animate-float-slow absolute -right-6 -bottom-6 hidden rounded-2xl glass-strong p-3 shadow-glow sm:block">
            <div class="flex items-center gap-2">
              <ShieldCheck class="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span class="text-xs font-semibold text-ink">KHQR Secured</span>
            </div>
          </div>
          <div class="animate-float absolute -bottom-5 left-8 hidden rounded-2xl glass-strong px-3 py-2 shadow-glow sm:flex" style="animation-delay: 1.2s">
            <div class="flex items-center gap-2">
              <CheckCircle2 class="h-4 w-4 text-secondary-600 dark:text-secondary-400" />
              <span class="text-xs font-semibold text-ink">Order #24501 placed</span>
            </div>
          </div>
        </div>

        <div class="pointer-events-none absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-secondary-500/15 blur-3xl dark:bg-secondary-500/20" />
        <div class="pointer-events-none absolute -right-8 top-16 h-40 w-40 rounded-full bg-brand-500/20 blur-3xl dark:bg-brand-500/25" />
      </div>
    </div>
  </section>
</template>
