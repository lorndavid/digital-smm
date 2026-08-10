<script setup lang="ts">
import { Boxes, Globe2, Timer, Users } from '@lucide/vue'

const stats = [
  { icon: Users, value: '12,400+', label: 'Happy customers' },
  { icon: Boxes, value: '850K+', label: 'Orders completed' },
  { icon: Timer, value: '< 30 min', label: 'Average start time' },
  { icon: Globe2, value: '25+', label: 'Countries served' },
]
</script>

<template>
  <section class="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
    <div
      class="glass-strong animate-gradient relative overflow-hidden rounded-3xl bg-gradient-to-r from-brand-500/10 via-brand-400/5 to-secondary-500/10 p-8 shadow-card dark:from-brand-950/60 dark:via-night-soft/60 dark:to-night/60 sm:p-12"
    >
      <div class="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        <div
          v-for="(stat, index) in stats"
          :key="stat.label"
          v-motion
          :initial="{ opacity: 0, y: 20 }"
          :visible="{ opacity: 1, y: 0, transition: { duration: 0.45, delay: index * 0.08 } }"
          class="flex flex-col items-center text-center"
        >
          <component :is="stat.icon" class="mb-3 h-7 w-7 text-brand-300" />
          <p class="font-display text-3xl font-bold text-ink">{{ stat.value }}</p>
          <p class="mt-1 text-sm text-ink/50">{{ stat.label }}</p>
        </div>
      </div>
    </div>
  </section>
</template>
