<script setup lang="ts">
import { Inbox } from '@lucide/vue'

withDefaults(defineProps<{ title: string; message?: string }>(), { message: '' })
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-3 py-12 text-center">
    <div class="glass flex h-16 w-16 items-center justify-center rounded-2xl">
      <slot name="icon">
        <Inbox class="h-7 w-7 text-(--a-muted-2)" />
      </slot>
    </div>
    <h3 class="text-base font-semibold text-(--a-text)/90">{{ title }}</h3>
    <p v-if="message" class="max-w-sm text-sm text-(--a-muted)">{{ message }}</p>
    <slot />
  </div>
</template>
