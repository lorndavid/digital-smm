<script setup lang="ts">
import logoUrl from '../../../asset/logo.png'

withDefaults(defineProps<{ size?: 'sm' | 'md' | 'lg' }>(), { size: 'md' })

/**
 * Responsive image height per size (the PNG is landscape 3:2 — width follows).
 * Sizes step up from phone → tablet → desktop so the logo reads well on every
 * device without overflowing compact headers.
 */
const img = {
  sm: 'h-11 sm:h-12 md:h-14',
  md: 'h-22 sm:h-24 md:h-28',
  lg: 'h-26 sm:h-28 md:h-32',
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
