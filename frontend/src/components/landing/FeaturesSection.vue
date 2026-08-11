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
    title: 'Fast Delivery',
    description: 'Orders start within minutes and most complete in under 30 minutes.',
  },
  {
    icon: Headphones,
    title: '24/7 Support',
    description: 'Our Cambodia-based team answers around the clock, on Telegram and email.',
  },
  {
    icon: ShieldCheck,
    title: 'Secure Payments',
    description: 'Pay safely with Bakong KHQR, ABA, ACLEDA or Wing — your money is protected.',
  },
  {
    icon: LineChart,
    title: 'Real-time Tracking',
    description: 'Follow every order live: progress, remaining counts and delivery status.',
  },
  {
    icon: Wallet,
    title: 'Affordable Prices',
    description: 'Competitive rates starting at just $0.40 per 1,000 with volume discounts.',
  },
  {
    icon: Sparkles,
    title: 'Premium Quality',
    description: 'High-retention, refillable engagement that keeps your profiles authentic.',
  },
]
</script>

<template>
  <section class="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
    <div class="mx-auto max-w-2xl text-center">
      <p class="text-sm font-semibold uppercase tracking-widest text-brand-300">Why DigitalSMM</p>
      <h2 class="font-display mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
        Everything you need to <span class="text-gradient">grow</span>
      </h2>
      <p class="mt-4 text-ink/60">
        A complete growth toolkit built for creators, brands and agencies in Cambodia.
      </p>
    </div>

    <!-- Infinite carousel of supported platforms (TikTok · Facebook · YouTube …) -->
    <div class="group relative mt-12 overflow-hidden" role="region" aria-label="Supported platforms">
      <div class="platform-track flex w-max items-center">
        <!-- Spacing lives INSIDE each copy (pr-4) so both copies are exactly
             equal width and translateX(-50%) loops seamlessly — a parent gap
             would offset the seam by half a gap and visibly jump. -->
        <template v-for="copy in 2" :key="copy">
          <div class="flex items-center gap-4 pr-4" :aria-hidden="copy === 2 || undefined">
            <div
              v-for="p in platforms"
              :key="p.key"
              class="flex shrink-0 items-center gap-3 rounded-2xl border border-ink/10 bg-card/60 px-5 py-3 shadow-card backdrop-blur transition-colors group-hover:border-brand-400/30"
            >
              <PlatformIcon :platform="p.key" size="sm" tile />
              <span class="whitespace-nowrap text-sm font-semibold text-ink/75">{{ p.label }}</span>
            </div>
          </div>
        </template>
      </div>
      <!-- Soft edge fades so the loop never visibly clips. -->
      <div
        class="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-surface to-transparent"
      />
      <div
        class="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-surface to-transparent"
      />
    </div>

    <div class="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      <div
        v-for="(feature, index) in features"
        :key="feature.title"
        v-motion
        :initial="{ opacity: 0, y: 28 }"
        :visible="{ opacity: 1, y: 0, transition: { duration: 0.5, delay: index * 0.06 } }"
        class="group glass rounded-2xl p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-brand-400/30 hover:shadow-glow"
      >
        <div
          class="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500/25 to-secondary-500/20 text-brand-300 transition-transform duration-300 group-hover:scale-110"
        >
          <component :is="feature.icon" class="h-6 w-6" />
        </div>
        <h3 class="font-display mt-5 text-lg font-semibold text-ink">{{ feature.title }}</h3>
        <p class="mt-2 text-sm leading-relaxed text-ink/55">{{ feature.description }}</p>
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
  /* With the loop stopped, show a single copy instead of the duplicated pair. */
  .platform-track > :nth-child(2) {
    display: none;
  }
}
</style>
