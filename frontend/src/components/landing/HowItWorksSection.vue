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
  <section id="how-it-works" class="relative py-14 sm:py-18">
    <div class="bg-grid pointer-events-none absolute inset-0 opacity-20" />
    <div class="container-page relative">
      <div class="mx-auto max-w-2xl text-center">
        <p class="text-xs font-semibold uppercase tracking-widest text-primary">How it works</p>
        <h2 class="font-display mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Growth in <span class="text-gradient">4 simple steps</span>
        </h2>
        <p class="mt-2 text-sm text-muted-foreground">From sign-up to results in under five minutes.</p>
      </div>

      <div class="relative mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
        <!-- Connecting line on desktop -->
        <div
          class="pointer-events-none absolute left-0 right-0 top-8 hidden h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent lg:block"
        />

        <div
          v-for="(step, index) in steps"
          :key="step.step"
          v-motion
          :initial="{ opacity: 0, y: 24 }"
          :visible="{ opacity: 1, y: 0, transition: { duration: 0.5, delay: index * 0.1 } }"
          class="relative"
        >
          <div
            class="relative flex h-14 w-14 items-center justify-center rounded-xl border border-border bg-card shadow-sm"
          >
            <component :is="step.icon" class="h-6 w-6 text-primary" />
            <span
              class="font-display absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground shadow-glow"
            >
              {{ index + 1 }}
            </span>
          </div>
          <h3 class="font-display mt-4 text-base font-semibold text-foreground">{{ step.title }}</h3>
          <p class="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{{ step.description }}</p>
        </div>
      </div>
    </div>
  </section>
</template>
