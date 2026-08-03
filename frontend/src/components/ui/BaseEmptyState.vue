<script setup lang="ts">
import { PackageOpen } from '@lucide/vue'

withDefaults(defineProps<{ title: string; message?: string }>(), { message: '' })
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-3 py-12 text-center">
    <div class="glass flex h-16 w-16 items-center justify-center rounded-2xl">
      <slot name="icon">
        <PackageOpen class="h-7 w-7 text-white/40" />
      </slot>
    </div>
    <h3 class="text-base font-semibold text-white/90">{{ title }}</h3>
    <p v-if="message" class="max-w-sm text-sm text-white/50">{{ message }}</p>
    <slot />
  </div>
</template>
