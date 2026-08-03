<script setup lang="ts">
import { useRouter } from 'vue-router'
import { Compass } from '@lucide/vue'
import BaseButton from '@/components/ui/BaseButton.vue'

const router = useRouter()
</script>

<template>
  <div class="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 text-center">
    <div class="bg-grid pointer-events-none absolute inset-0 opacity-40" />
    <div class="pointer-events-none absolute top-1/4 h-80 w-80 rounded-full bg-brand-500/20 blur-[100px]" />
    <div class="relative">
      <p class="font-display text-[7rem] font-bold leading-none text-gradient sm:text-[10rem]">404</p>
      <h1 class="font-display mt-2 text-2xl font-bold text-white">Page not found</h1>
      <p class="mx-auto mt-3 max-w-sm text-sm text-white/50">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <div class="mt-8 flex items-center justify-center gap-3">
        <BaseButton @click="router.push('/')">
          <Compass class="h-4 w-4" /> Back home
        </BaseButton>
        <BaseButton variant="outline" @click="router.push('/dashboard')">Go to dashboard</BaseButton>
      </div>
    </div>
  </div>
</template>
