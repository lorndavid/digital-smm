<script setup lang="ts">
import logoUrl from '../../../asset/logo.png'

withDefaults(defineProps<{ size?: 'sm' | 'md' | 'lg' }>(), { size: 'md' })

/** Image height per size (the PNG is landscape 3:2 — width follows). */
const img = { sm: 'h-7', md: 'h-9', lg: 'h-12' }
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
