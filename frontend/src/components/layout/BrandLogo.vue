<script setup lang="ts">
import { Zap } from '@lucide/vue'

withDefaults(defineProps<{ size?: 'sm' | 'md' | 'lg' }>(), { size: 'md' })

const box = { sm: 'h-7 w-7 rounded-lg', md: 'h-9 w-9 rounded-xl', lg: 'h-12 w-12 rounded-2xl' }
const text = { sm: 'text-lg', md: 'text-xl', lg: 'text-2xl' }
</script>

<template>
  <div class="flex items-center gap-2">
    <div
      class="flex items-center justify-center bg-gradient-to-br from-brand-500 to-secondary-600 shadow-glow"
      :class="box[size]"
    >
      <Zap class="h-1/2 w-1/2 text-white" :stroke-width="2.5" fill="currentColor" />
    </div>
    <span class="font-display font-bold tracking-tight text-white" :class="text[size]">
      Vid<span class="text-gradient">SMM</span>
    </span>
  </div>
</template>
