<script setup lang="ts">
import { ArrowRight } from '@lucide/vue'
import BaseButton from '@/components/ui/BaseButton.vue'

withDefaults(
  defineProps<{
    title?: string
    body?: string
    ctaTo?: string
    ctaLabel?: string
  }>(),
  {
    title: 'Ready to grow your account?',
    body: 'Sign in, top up your wallet and your order starts within minutes. Secure KHQR payments, real-time tracking and refill support.',
    ctaTo: '/sign-in',
    ctaLabel: 'Get started',
  },
)
</script>

<template>
  <section data-seo-cta class="py-10">
    <div class="container-page">
      <div
        class="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-8 text-center text-white shadow-xl sm:p-12"
      >
        <div class="bg-grid pointer-events-none absolute inset-0 opacity-10" />
        <div class="relative">
          <h2 class="font-display text-2xl font-extrabold sm:text-3xl">{{ title }}</h2>
          <p class="mx-auto mt-3 max-w-xl text-sm text-indigo-200/80">{{ body }}</p>
          <div class="mt-6 flex justify-center">
            <RouterLink :to="ctaTo">
              <BaseButton variant="primary" size="lg">
                {{ ctaLabel }} <ArrowRight class="h-4 w-4" />
              </BaseButton>
            </RouterLink>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
