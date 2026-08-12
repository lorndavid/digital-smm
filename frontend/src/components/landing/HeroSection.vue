<script setup lang="ts">
import { useRouter } from 'vue-router'
import {
  ArrowRight,
  CheckCircle2,
  LogOut,
  Play,
  QrCode,
  ShieldCheck,
  Sparkles,
  Zap,
} from '@lucide/vue'
import { useAuthStore } from '@/stores/auth.store'
import BaseButton from '@/components/ui/BaseButton.vue'
import PlatformIcon from '@/components/ui/PlatformIcon.vue'

const router = useRouter()
const authStore = useAuthStore()

async function onSignOut(): Promise<void> {
  await authStore.signOut()
  router.push('/')
}
</script>

<template>
  <section id="home" class="relative overflow-hidden pb-16 pt-28 sm:pb-20 sm:pt-32">
    <!-- Ambient background: subtle grid + soft radial glows (light-first). -->
    <div class="bg-grid pointer-events-none absolute inset-0 opacity-30 dark:opacity-50" />
    <div
      class="pointer-events-none absolute -top-48 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-gradient-to-r from-primary/10 via-primary/5 to-secondary/10 blur-[120px]"
    />

    <div class="container-page relative grid items-center gap-10 lg:grid-cols-2 lg:gap-8">
      <!-- Copy -->
      <div class="max-w-xl">
        <!-- Announcement badge -->
        <div
          v-motion
          :initial="{ opacity: 0, y: 18 }"
          :visible="{ opacity: 1, y: 0, transition: { duration: 0.4 } }"
          class="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3.5 py-1.5 text-xs font-medium text-primary dark:text-primary"
        >
          <Sparkles class="h-3.5 w-3.5" />
          Social growth, delivered in minutes
        </div>

        <h1
          v-motion
          :initial="{ opacity: 0, y: 22 }"
          :visible="{ opacity: 1, y: 0, transition: { duration: 0.5, delay: 0.05 } }"
          class="font-display mt-5 text-[clamp(2.25rem,4.25vw,3.5rem)] font-bold leading-[1.05] tracking-tight text-foreground"
        >
          Grow your social media<br />
          <span class="text-gradient">faster than ever</span>
        </h1>

        <p
          v-motion
          :initial="{ opacity: 0, y: 22 }"
          :visible="{ opacity: 1, y: 0, transition: { duration: 0.5, delay: 0.12 } }"
          class="mt-4 max-w-lg text-base leading-normal text-muted-foreground sm:text-[17px]"
        >
          Real TikTok, Facebook, Instagram, YouTube and Telegram growth — ordered in
          seconds, tracked live, and paid for securely with KHQR.
        </p>

        <div
          v-motion
          :initial="{ opacity: 0, y: 22 }"
          :visible="{ opacity: 1, y: 0, transition: { duration: 0.5, delay: 0.2 } }"
          class="mt-6 flex flex-wrap items-center gap-3"
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

        <!-- Real trust points (no invented statistics). -->
        <div
          v-motion
          :initial="{ opacity: 0, y: 22 }"
          :visible="{ opacity: 1, y: 0, transition: { duration: 0.5, delay: 0.28 } }"
          class="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-muted-foreground"
        >
          <span class="flex items-center gap-2">
            <Zap class="h-4 w-4 text-primary" /> Instant start
          </span>
          <span class="flex items-center gap-2">
            <CheckCircle2 class="h-4 w-4 text-emerald-500" /> Real-time tracking
          </span>
          <span class="flex items-center gap-2">
            <ShieldCheck class="h-4 w-4 text-primary" /> KHQR secured
          </span>
        </div>
      </div>

      <!-- Product visual: central order card + floating chips -->
      <div class="relative mx-auto w-full max-w-md lg:max-w-none">
        <div
          v-motion
          :initial="{ opacity: 0, scale: 0.95 }"
          :visible="{ opacity: 1, scale: 1, transition: { duration: 0.55, delay: 0.15 } }"
          class="relative rounded-2xl border border-border bg-card p-5 shadow-card"
        >
          <div class="flex items-center justify-between">
            <div>
              <p class="text-xs font-medium text-muted-foreground">Live order activity</p>
              <p class="font-display mt-0.5 text-2xl font-bold text-foreground">2 active orders</p>
            </div>
            <div
              class="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary-500 text-primary-foreground shadow-glow"
            >
              <QrCode class="h-5 w-5" />
            </div>
          </div>

          <div class="mt-5 space-y-2.5">
            <div class="rounded-xl border border-border bg-muted/60 px-4 py-3">
              <div class="flex items-center gap-3">
                <PlatformIcon platform="tiktok" size="md" tile />
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-semibold text-foreground">TikTok Followers</p>
                  <p class="text-xs text-muted-foreground">2,500 · In progress</p>
                </div>
                <span class="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 ring-1 ring-inset ring-emerald-500/25 dark:text-emerald-400">
                  +250
                </span>
              </div>
              <div class="mt-2.5 h-1.5 overflow-hidden rounded-full bg-border">
                <div class="h-full w-3/5 rounded-full bg-gradient-to-r from-primary to-secondary-500" />
              </div>
            </div>
            <div class="rounded-xl border border-border bg-muted/60 px-4 py-3">
              <div class="flex items-center gap-3">
                <PlatformIcon platform="facebook" size="md" tile />
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-semibold text-foreground">Facebook Page Likes</p>
                  <p class="text-xs text-muted-foreground">1,000 · Completed</p>
                </div>
                <span class="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 ring-1 ring-inset ring-emerald-500/25 dark:text-emerald-400">
                  Done
                </span>
              </div>
              <div class="mt-2.5 h-1.5 overflow-hidden rounded-full bg-border">
                <div class="h-full w-full rounded-full bg-emerald-500" />
              </div>
            </div>
          </div>
        </div>

        <!-- Floating chips (hidden on small screens to keep the hero clean). -->
        <div
          class="animate-float absolute -left-5 -top-5 hidden items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-card sm:flex"
        >
          <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Play class="h-4 w-4" fill="currentColor" />
          </span>
          <div>
            <p class="text-xs font-semibold text-foreground">Order started</p>
            <p class="text-[11px] text-muted-foreground">just now</p>
          </div>
        </div>
        <div
          class="animate-float-slow absolute -bottom-5 -right-4 hidden items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-card sm:flex"
        >
          <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
            <ShieldCheck class="h-4 w-4" />
          </span>
          <div>
            <p class="text-xs font-semibold text-foreground">Payment confirmed</p>
            <p class="text-[11px] text-muted-foreground">KHQR · Bakong</p>
          </div>
        </div>
        <div
          class="animate-float absolute -bottom-4 left-6 hidden items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-card sm:flex"
          style="animation-delay: 1.2s"
        >
          <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary-500/10 text-secondary-600">
            <CheckCircle2 class="h-4 w-4" />
          </span>
          <p class="text-xs font-semibold text-foreground">Order #24501 placed</p>
        </div>

        <div class="pointer-events-none absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-secondary-500/10 blur-3xl" />
        <div class="pointer-events-none absolute -right-8 top-16 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
      </div>
    </div>
  </section>
</template>
