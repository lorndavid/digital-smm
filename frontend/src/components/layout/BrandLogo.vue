<script setup lang="ts">
import logoUrl from '../../../asset/logo.png'

withDefaults(defineProps<{ size?: 'sm' | 'md' | 'lg' }>(), { size: 'md' })

/**
 * Responsive image height per size (the PNG is landscape 3:2 — width follows).
 * Sizes step up from phone → tablet → desktop so the logo reads well on every
 * device without overflowing compact headers.
 */
const img = {
  sm: 'h-8 sm:h-10 md:h-12',
  md: 'h-16 sm:h-20 md:h-24',
  lg: 'h-20 sm:h-24 md:h-28',
}
</script>

<template>
  <span class="inline-flex shrink-0 items-center">
    <img
      :src="logoUrl"
      alt="DigitalSMM"
      class="block w-auto object-contain"
      :class="img[size]"
    />
  </span>
</template>
