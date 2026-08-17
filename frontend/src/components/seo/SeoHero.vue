<script setup lang="ts">
import { ArrowRight, Zap } from '@lucide/vue'
import BaseButton from '@/components/ui/BaseButton.vue'

withDefaults(
  defineProps<{
    eyebrow?: string
    title: string
    description: string
    /** CTA destination (defaults to the services explorer). */
    ctaTo?: string
    ctaLabel?: string
  }>(),
  {
    eyebrow: 'DigitalSMM',
    ctaTo: '/dashboard/services',
    ctaLabel: 'Browse services',
  },
)
</script>

<template>
  <section class="relative overflow-hidden py-14 sm:py-20">
    <div class="pointer-events-none absolute inset-0">
      <div
        class="absolute -top-32 left-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-gradient-to-r from-brand-600/25 via-brand-500/10 to-secondary-500/20 blur-[110px]"
      />
      <div class="bg-grid pointer-events-none absolute inset-0 opacity-[0.04]" />
    </div>

    <div class="container-page relative text-center">
      <p class="mx-auto inline-flex items-center gap-1.5 rounded-full border border-brand-400/30 bg-brand-500/10 px-3 py-1 text-xs font-semibold text-brand-300">
        <Zap class="h-3 w-3" /> {{ eyebrow }}
      </p>
      <h1 class="font-display mx-auto mt-4 max-w-3xl text-3xl font-extrabold tracking-tight text-ink sm:text-4xl lg:text-5xl">
        {{ title }}
      </h1>
      <p class="mx-auto mt-4 max-w-2xl text-[15px] leading-relaxed text-ink/60 sm:text-base">
        {{ description }}
      </p>
      <div class="mt-7 flex flex-wrap items-center justify-center gap-3">
        <RouterLink :to="ctaTo">
          <BaseButton variant="primary" size="lg">
            {{ ctaLabel }} <ArrowRight class="h-4 w-4" />
          </BaseButton>
        </RouterLink>
        <RouterLink to="/sign-in">
          <BaseButton variant="outline" size="lg">
            Sign in to order
          </BaseButton>
        </RouterLink>
      </div>
    </div>
  </section>
</template>
