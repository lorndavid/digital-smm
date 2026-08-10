<script setup lang="ts">
import { Clock3, Headphones, LineChart, ShieldCheck, Sparkles, Wallet } from '@lucide/vue'

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
      <p class="text-sm font-semibold uppercase tracking-widest text-brand-300">Why VidSMM</p>
      <h2 class="font-display mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
        Everything you need to <span class="text-gradient">grow</span>
      </h2>
      <p class="mt-4 text-ink/60">
        A complete growth toolkit built for creators, brands and agencies in Cambodia.
      </p>
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
