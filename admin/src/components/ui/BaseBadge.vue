<script setup lang="ts">
type Tone = 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'

withDefaults(defineProps<{ tone?: Tone; dot?: boolean }>(), { tone: 'neutral', dot: false })

const tones: Record<Tone, string> = {
  brand: 'bg-brand-500/10 text-brand-300 ring-brand-400/30',
  success: 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/30',
  warning: 'bg-amber-400/10 text-amber-300 ring-amber-400/30',
  danger: 'bg-rose-400/10 text-rose-300 ring-rose-400/30',
  info: 'bg-sky-400/10 text-sky-300 ring-sky-400/30',
  neutral: 'bg-(--a-soft) text-(--a-text-soft) ring-(--a-border)',
}

const dotColors: Record<Tone, string> = {
  brand: 'bg-brand-400',
  success: 'bg-emerald-400',
  warning: 'bg-amber-400',
  danger: 'bg-rose-400',
  info: 'bg-sky-400',
  neutral: 'bg-(--a-muted-3)',
}
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset"
    :class="tones[tone]"
  >
    <span v-if="dot" class="h-1.5 w-1.5 rounded-full" :class="dotColors[tone]" />
    <slot />
  </span>
</template>
