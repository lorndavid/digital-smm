<script setup lang="ts">
import type { Component } from 'vue'

withDefaults(
  defineProps<{
    label: string
    value: string
    icon: Component
    trend?: string
    accent?: string
  }>(),
  {
    trend: '',
    accent: 'from-brand-500/25 to-secondary-500/20 text-brand-300',
  },
)
</script>

<template>
  <div
    class="glass rounded-2xl p-5 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:border-brand-400/30 hover:shadow-glow"
  >
    <div class="flex items-center justify-between">
      <p class="text-sm text-ink/50">{{ label }}</p>
      <div
        class="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br"
        :class="accent"
      >
        <component :is="icon" class="h-5 w-5" />
      </div>
    </div>
    <p class="font-display mt-2 text-2xl font-bold text-ink">{{ value }}</p>
    <p
      v-if="trend"
      class="mt-1 text-xs"
      :class="trend.startsWith('-') ? 'text-rose-300' : 'text-emerald-300'"
    >
      {{ trend }}
    </p>
  </div>
</template>
