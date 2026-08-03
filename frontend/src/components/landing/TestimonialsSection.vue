<script setup lang="ts">
import { Star } from '@lucide/vue'

const testimonials = [
  {
    quote:
      'VidSMM is the only service I trust for my TikTok shop brand. Orders start instantly and the KHQR top-up takes seconds. Amazing support too.',
    name: 'Sokha Chan',
    role: 'Brand Owner · Phnom Penh',
    initials: 'SC',
    gradient: 'from-brand-500 to-brand-700',
  },
  {
    quote:
      'We manage 40+ client pages and VidSMM handles all the heavy lifting. The real-time tracking and auto-refills save us hours every single week.',
    name: 'Dara Kim',
    role: 'Agency Founder · Siem Reap',
    initials: 'DK',
    gradient: 'from-secondary-500 to-secondary-700',
  },
  {
    quote:
      'Started with $10 to test. Delivery was so fast and clean that I now run my whole content strategy through VidSMM. Best decision this year.',
    name: 'Malis Rath',
    role: 'Content Creator · Battambang',
    initials: 'MR',
    gradient: 'from-accent-500 to-accent-700',
  },
]
</script>

<template>
  <section class="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
    <div class="mx-auto max-w-2xl text-center">
      <p class="text-sm font-semibold uppercase tracking-widest text-brand-300">Testimonials</p>
      <h2 class="font-display mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
        Loved by creators <span class="text-gradient">across Cambodia</span>
      </h2>
    </div>

    <div class="mt-14 grid gap-6 lg:grid-cols-3">
      <figure
        v-for="(testimonial, index) in testimonials"
        :key="testimonial.name"
        v-motion
        :initial="{ opacity: 0, y: 28 }"
        :visible="{ opacity: 1, y: 0, transition: { duration: 0.5, delay: index * 0.08 } }"
        class="glass flex flex-col justify-between rounded-3xl p-7 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-brand-400/30"
      >
        <div>
          <div class="flex gap-1">
            <Star v-for="n in 5" :key="n" class="h-4 w-4 text-amber-400" fill="currentColor" />
          </div>
          <blockquote class="mt-4 text-sm leading-relaxed text-white/70">
            “{{ testimonial.quote }}”
          </blockquote>
        </div>
        <figcaption class="mt-6 flex items-center gap-3">
          <div
            class="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold text-white"
            :class="testimonial.gradient"
          >
            {{ testimonial.initials }}
          </div>
          <div>
            <p class="text-sm font-semibold text-white">{{ testimonial.name }}</p>
            <p class="text-xs text-white/45">{{ testimonial.role }}</p>
          </div>
        </figcaption>
      </figure>
    </div>
  </section>
</template>
