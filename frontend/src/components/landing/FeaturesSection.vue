<script setup lang="ts">
import { Clock3, Headphones, LineChart, ShieldCheck, Sparkles, Wallet } from '@lucide/vue'
import PlatformIcon from '@/components/ui/PlatformIcon.vue'

/** Platforms shown in the infinite carousel above the feature grid. */
const platforms = [
  { key: 'tiktok', label: 'TikTok' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'telegram', label: 'Telegram' },
  { key: 'twitter', label: 'X (Twitter)' },
  { key: 'threads', label: 'Threads' },
  { key: 'other', label: 'And many more' },
]

const features = [
  {
    icon: Clock3,
    title: 'Fast delivery',
    description: 'Orders start within minutes and most complete in under 30 minutes.',
  },
  {
    icon: Headphones,
    title: '24/7 support',
    description: 'Our Cambodia-based team answers around the clock, on Telegram and email.',
  },
  {
    icon: ShieldCheck,
    title: 'Secure payments',
    description: 'Pay safely with Bakong KHQR, ABA, ACLEDA or Wing — your money is protected.',
  },
  {
    icon: LineChart,
    title: 'Real-time tracking',
    description: 'Follow every order live: progress, remaining counts and delivery status.',
  },
  {
    icon: Wallet,
    title: 'Pay-as-you-go wallet',
    description: 'Top up once and order anytime. No subscriptions, no hidden fees.',
  },
  {
    icon: Sparkles,
    title: 'Premium quality',
    description: 'High-retention, refillable engagement that keeps your profiles authentic.',
  },
]
</script>

<template>
  <section class="py-14 sm:py-18">
    <div class="container-page">
      <div class="mx-auto max-w-2xl text-center">
        <p class="text-xs font-semibold uppercase tracking-widest text-primary">Why DigitalSMM</p>
        <h2 class="font-display mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Everything you need to <span class="text-gradient">grow</span>
        </h2>
        <p class="mt-2 text-sm text-muted-foreground">
          A complete growth toolkit built for creators, brands and agencies in Cambodia.
        </p>
      </div>

      <!-- Infinite carousel of supported platforms (TikTok · Facebook · YouTube …) -->
      <div class="group relative mt-9 overflow-hidden" role="region" aria-label="Supported platforms">
        <div class="platform-track flex w-max items-center">
          <template v-for="copy in 2" :key="copy">
            <div class="flex items-center gap-4 pr-4" :aria-hidden="copy === 2 || undefined">
              <div
                v-for="p in platforms"
                :key="p.key"
                class="flex shrink-0 items-center gap-2.5 rounded-xl border border-border bg-card px-4 py-2.5 shadow-sm transition-colors group-hover:border-primary/30"
              >
                <PlatformIcon :platform="p.key" size="sm" tile />
                <span class="whitespace-nowrap text-sm font-semibold text-foreground/80">{{ p.label }}</span>
              </div>
            </div>
          </template>
        </div>
        <div class="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-background to-transparent" />
        <div class="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-background to-transparent" />
      </div>

      <div class="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="(feature, index) in features"
          :key="feature.title"
          v-motion
          :initial="{ opacity: 0, y: 24 }"
          :visible="{ opacity: 1, y: 0, transition: { duration: 0.5, delay: index * 0.06 } }"
          class="group rounded-xl border border-border bg-card p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-card"
        >
          <div
            class="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/15 bg-primary/5 text-primary transition-transform duration-300 group-hover:scale-105"
          >
            <component :is="feature.icon" class="h-5 w-5" />
          </div>
          <h3 class="font-display mt-4 text-base font-semibold text-foreground">{{ feature.title }}</h3>
          <p class="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{{ feature.description }}</p>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* Infinite platform carousel — two copies translate -50% for a seamless loop. */
.platform-track {
  animation: platform-marquee 30s linear infinite;
  will-change: transform;
}
.group:hover .platform-track {
  animation-play-state: paused;
}
@keyframes platform-marquee {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(-50%);
  }
}
@media (prefers-reduced-motion: reduce) {
  .platform-track {
    animation: none;
  }
  .platform-track > :nth-child(2) {
    display: none;
  }
}
</style>
