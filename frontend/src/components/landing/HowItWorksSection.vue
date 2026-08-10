<script setup lang="ts">
import { CreditCard, MousePointerClick, Rocket, UserPlus } from '@lucide/vue'

const steps = [
  {
    icon: UserPlus,
    step: '01',
    title: 'Create your account',
    description: 'Sign in with Google in one click. Your wallet is created instantly.',
  },
  {
    icon: MousePointerClick,
    step: '02',
    title: 'Pick a service',
    description: 'Choose your platform and service, enter your link and quantity.',
  },
  {
    icon: CreditCard,
    step: '03',
    title: 'Top up your wallet',
    description: 'Fund with KHQR — scan with Bakong, ABA, ACLEDA or Wing and get credited instantly.',
  },
  {
    icon: Rocket,
    step: '04',
    title: 'Place & track',
    description: 'Order straight from your wallet balance and track delivery in real time.',
  },
]
</script>

<template>
  <section id="how-it-works" class="relative py-24">
    <div class="bg-grid pointer-events-none absolute inset-0 opacity-40" />
    <div class="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div class="mx-auto max-w-2xl text-center">
        <p class="text-sm font-semibold uppercase tracking-widest text-brand-300">How it works</p>
        <h2 class="font-display mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
          Growth in <span class="text-gradient">4 simple steps</span>
        </h2>
        <p class="mt-4 text-ink/60">From sign-up to results in under five minutes.</p>
      </div>

      <div class="relative mt-16 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
        <div
          v-for="(step, index) in steps"
          :key="step.step"
          v-motion
          :initial="{ opacity: 0, y: 28 }"
          :visible="{ opacity: 1, y: 0, transition: { duration: 0.5, delay: index * 0.1 } }"
          class="relative"
        >
          <div
            class="glass flex h-16 w-16 items-center justify-center rounded-2xl shadow-card transition-all duration-300 hover:shadow-glow"
          >
            <component :is="step.icon" class="h-7 w-7 text-brand-300" />
          </div>
          <p class="font-display mt-5 text-sm font-bold tracking-widest text-brand-400">
            {{ step.step }}
          </p>
          <h3 class="font-display mt-2 text-lg font-semibold text-ink">{{ step.title }}</h3>
          <p class="mt-2 text-sm leading-relaxed text-ink/55">{{ step.description }}</p>

          <div
            v-if="index < steps.length - 1"
            class="absolute -right-6 top-8 hidden text-ink/20 lg:block"
          >
            →
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
