<script setup lang="ts">
import { useRouter } from 'vue-router'
import { ArrowRight, Mail } from '@lucide/vue'
import { useAuthStore } from '@/stores/auth.store'
import BaseButton from '@/components/ui/BaseButton.vue'

const router = useRouter()
const authStore = useAuthStore()
</script>

<template>
  <section id="contact" class="container-page py-14 sm:py-18">
    <div
      class="relative overflow-hidden rounded-2xl border border-border bg-card px-6 py-12 text-center shadow-card sm:px-12 sm:py-16"
    >
      <!-- Subtle premium background -->
      <div class="bg-grid pointer-events-none absolute inset-0 opacity-20" />
      <div
        class="pointer-events-none absolute -top-24 left-1/2 h-64 w-[560px] -translate-x-1/2 rounded-full bg-gradient-to-r from-primary/15 via-primary/5 to-secondary-500/10 blur-3xl"
      />

      <div class="relative mx-auto max-w-2xl">
        <h2 class="font-display text-2xl font-bold tracking-tight text-foreground sm:text-4xl">
          Ready to grow your social media?
        </h2>
        <p v-if="authStore.isLoaded && authStore.isSignedIn" class="mt-2.5 text-sm text-muted-foreground">
          Welcome back! Jump straight into your dashboard to track orders, top up your wallet
          and keep growing.
        </p>
        <p v-else class="mt-2.5 text-sm text-muted-foreground">
          Join creators and agencies across Cambodia already growing with DigitalSMM.
          Sign up in seconds with your Google account.
        </p>
        <div class="mt-6 flex flex-wrap items-center justify-center gap-3">
          <BaseButton
            size="lg"
            variant="secondary"
            @click="router.push(authStore.isSignedIn ? '/dashboard' : '/sign-in')"
          >
            {{ authStore.isSignedIn ? 'Go to Dashboard' : "Start Now — it's free" }}
            <ArrowRight class="h-4 w-4" />
          </BaseButton>
          <a
            href="mailto:support@digitalsmm.shop"
            class="inline-flex h-11 items-center gap-2 rounded-lg border border-border bg-background px-5 text-sm font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-muted"
          >
            <Mail class="h-4 w-4" /> Contact us
          </a>
        </div>
      </div>
    </div>
  </section>
</template>
