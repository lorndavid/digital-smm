<script setup lang="ts">
import { useRouter } from 'vue-router'
import BaseButton from '@/components/ui/BaseButton.vue'

const router = useRouter()
</script>

<template>
  <div class="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 text-center">
    <div class="bg-grid pointer-events-none absolute inset-0 opacity-40" />
    <div class="relative">
      <p class="font-display text-[7rem] font-bold leading-none text-gradient">404</p>
      <h1 class="font-display mt-2 text-2xl font-bold text-white">Page not found</h1>
      <p class="mx-auto mt-3 max-w-sm text-sm text-white/50">
        The admin page you're looking for doesn't exist.
      </p>
      <BaseButton class="mt-8" @click="router.push('/')">Back to dashboard</BaseButton>
    </div>
  </div>
</template>
