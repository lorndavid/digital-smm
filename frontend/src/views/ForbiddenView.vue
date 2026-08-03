<script setup lang="ts">
import { useRouter } from 'vue-router'
import { Lock } from '@lucide/vue'
import BaseButton from '@/components/ui/BaseButton.vue'

const router = useRouter()
</script>

<template>
  <div class="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 text-center">
    <div class="bg-grid pointer-events-none absolute inset-0 opacity-40" />
    <div class="pointer-events-none absolute top-1/4 h-80 w-80 rounded-full bg-rose-500/15 blur-[100px]" />
    <div class="relative">
      <p class="font-display text-[7rem] font-bold leading-none text-gradient sm:text-[10rem]">403</p>
      <h1 class="font-display mt-2 text-2xl font-bold text-white">Access denied</h1>
      <p class="mx-auto mt-3 max-w-sm text-sm text-white/50">
        You don't have permission to view this page. If you believe this is a mistake, contact
        support.
      </p>
      <div class="mt-8 flex items-center justify-center gap-3">
        <BaseButton @click="router.push('/dashboard')">
          <Lock class="h-4 w-4" /> Back to dashboard
        </BaseButton>
        <BaseButton variant="outline" @click="router.push('/')">Back home</BaseButton>
      </div>
    </div>
  </div>
</template>
