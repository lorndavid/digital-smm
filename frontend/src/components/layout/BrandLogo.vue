<script setup lang="ts">
import logoUrl from '../../../asset/logo.png'

withDefaults(defineProps<{ size?: 'sm' | 'md' | 'lg' }>(), { size: 'md' })

/** Chip + image height per size (the PNG is landscape 3:2 — width follows). */
const img = { sm: 'h-5', md: 'h-6', lg: 'h-8' }
const chip = { sm: 'rounded-md p-0.5', md: 'rounded-lg p-1', lg: 'rounded-lg p-1' }
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center bg-white shadow-sm ring-1 ring-ink/10"
    :class="chip[size]"
  >
    <img
      :src="logoUrl"
      alt="DigitalSMM"
      class="block w-auto object-contain"
      :class="img[size]"
    />
  </span>
</template>
