<script setup lang="ts">
import { Menu } from '@lucide/vue'
import { useAuthStore } from '@/stores/auth.store'
import BrandLogo from '@/components/layout/BrandLogo.vue'

defineEmits<{ toggle: [] }>()

const authStore = useAuthStore()

function initials(): string {
  const source = authStore.user?.name || authStore.user?.email || 'V'
  return source.slice(0, 2).toUpperCase()
}
</script>

<template>
  <header
    class="glass-strong sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/10 px-4 lg:hidden"
  >
    <button
      class="flex h-10 w-10 items-center justify-center rounded-xl text-white/80 transition-colors hover:bg-white/5"
      aria-label="Open menu"
      @click="$emit('toggle')"
    >
      <Menu class="h-5 w-5" />
    </button>
    <BrandLogo size="sm" />
    <RouterLink
      to="/dashboard/profile"
      class="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-secondary-500 text-xs font-bold text-white shadow-glow transition-transform hover:scale-105"
      aria-label="My profile"
      :title="authStore.user?.email ?? 'My profile'"
    >
      {{ initials() }}
    </RouterLink>
  </header>
</template>
