<script setup lang="ts">
import { PackageOpen } from '@lucide/vue'

withDefaults(defineProps<{ title: string; message?: string }>(), { message: '' })
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-2.5 py-8 text-center">
    <div class="glass flex h-12 w-12 items-center justify-center rounded-xl">
      <slot name="icon">
        <PackageOpen class="h-5 w-5 text-ink/40" />
      </slot>
    </div>
    <h3 class="text-sm font-semibold text-ink/90">{{ title }}</h3>
    <p v-if="message" class="max-w-sm text-sm text-ink/50">{{ message }}</p>
    <slot />
  </div>
</template>
