<script setup lang="ts">
import { useRouter } from 'vue-router'
import { Check, Sparkles } from '@lucide/vue'
import BaseButton from '@/components/ui/BaseButton.vue'

const router = useRouter()

const plans = [
  {
    name: 'Starter',
    price: '$10',
    description: 'Perfect for trying VidSMM with a small boost.',
    features: ['All core services', 'KHQR wallet top-ups', 'Real-time order tracking', 'Email support'],
    highlight: false,
  },
  {
    name: 'Pro',
    price: '$50',
    description: 'For creators and growing pages that post regularly.',
    features: [
      'Everything in Starter',
      'Priority delivery queue',
      'Automatic refills included',
      'Subscriptions & web traffic',
      'Priority 24/7 support',
    ],
    highlight: true,
  },
  {
    name: 'Business',
    price: 'Custom',
    description: 'For agencies and brands with high volume needs.',
    features: [
      'Everything in Pro',
      'Dedicated account manager',
      'Bulk discounts & API access',
      'Custom invoicing (ABA/Wing)',
      'SLA & white-label options',
    ],
    highlight: false,
  },
]
</script>

<template>
  <section id="pricing" class="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
    <div class="mx-auto max-w-2xl text-center">
      <p class="text-sm font-semibold uppercase tracking-widest text-brand-300">Pricing preview</p>
      <h2 class="font-display mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
        Simple, <span class="text-gradient">transparent pricing</span>
      </h2>
      <p class="mt-4 text-white/60">
        Pay-as-you-go with wallet top-ups. No subscriptions required — only when you grow.
      </p>
    </div>

    <div class="mt-14 grid gap-6 lg:grid-cols-3">
      <div
        v-for="(plan, index) in plans"
        :key="plan.name"
        v-motion
        :initial="{ opacity: 0, y: 28 }"
        :visible="{ opacity: 1, y: 0, transition: { duration: 0.5, delay: index * 0.08 } }"
        class="relative rounded-3xl p-[1px] transition-transform duration-300"
        :class="plan.highlight ? 'bg-gradient-to-b from-brand-500 to-secondary-500 shadow-glow lg:-translate-y-3' : 'bg-white/10 hover:-translate-y-1'"
      >
        <div class="glass-strong h-full rounded-3xl p-7">
          <div v-if="plan.highlight" class="mb-4 inline-flex items-center gap-1.5 rounded-full bg-brand-500/20 px-3 py-1 text-xs font-semibold text-brand-200 ring-1 ring-inset ring-brand-400/40">
            <Sparkles class="h-3 w-3" /> Most popular
          </div>
          <h3 class="font-display text-lg font-semibold text-white">{{ plan.name }}</h3>
          <p class="mt-1 text-sm text-white/50">{{ plan.description }}</p>
          <p class="font-display mt-5 text-4xl font-bold text-white">
            {{ plan.price }}<span v-if="plan.price !== 'Custom'" class="text-base font-medium text-white/40"> / start</span>
          </p>
          <ul class="mt-6 space-y-3">
            <li v-for="feature in plan.features" :key="feature" class="flex items-start gap-2.5 text-sm text-white/70">
              <Check class="mt-0.5 h-4 w-4 shrink-0 text-secondary-400" />
              {{ feature }}
            </li>
          </ul>
          <BaseButton
            class="mt-8"
            :variant="plan.highlight ? 'primary' : 'outline'"
            block
            @click="router.push('/sign-in')"
          >
            Get started
          </BaseButton>
        </div>
      </div>
    </div>
  </section>
</template>
