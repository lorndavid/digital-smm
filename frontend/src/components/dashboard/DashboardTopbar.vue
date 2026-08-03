<script setup lang="ts">
import { Menu } from '@lucide/vue'
import { UserButton } from '@clerk/vue'
import BrandLogo from '@/components/layout/BrandLogo.vue'

defineEmits<{ toggle: [] }>()
</script>

<template>
  <header
    class="glass-strong sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/10 px-4 lg:hidden"
  >
    <button
      class="flex h-10 w-10 items-center justify-center rounded-xl text-white/80"
      aria-label="Open menu"
      @click="$emit('toggle')"
    >
      <Menu class="h-5 w-5" />
    </button>
    <BrandLogo size="sm" />
    <UserButton />
  </header>
</template>
