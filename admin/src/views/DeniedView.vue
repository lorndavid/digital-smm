<script setup lang="ts">
import { useRouter } from 'vue-router'
import { ShieldX } from '@lucide/vue'
import BaseButton from '@/components/ui/BaseButton.vue'

const router = useRouter()
</script>

<template>
  <div class="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 text-center">
    <div class="bg-grid pointer-events-none absolute inset-0 opacity-40" />
    <div class="relative">
      <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-300 shadow-glow">
        <ShieldX class="h-10 w-10" />
      </div>
      <h1 class="font-display mt-4 text-2xl font-bold text-(--a-text)">Access denied</h1>
      <p class="mx-auto mt-3 max-w-sm text-sm text-(--a-muted)">
        Your account doesn't have the admin role required to access this panel. If you believe
        this is a mistake, ask the platform owner to assign you an admin role from the
        Admins &amp; Roles page.
      </p>
      <BaseButton class="mt-8" @click="router.push('/login')">Back to sign in</BaseButton>
    </div>
  </div>
</template>
