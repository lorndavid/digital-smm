<script setup lang="ts">
import { useAuthStore } from '@/stores/auth.store'
import ToastHost from '@/components/ui/ToastHost.vue'

const authStore = useAuthStore()

// Rehydrate the session from the stored token (validated against /api/auth/me).
void authStore.init()
</script>

<template>
  <RouterView v-slot="{ Component }">
    <Transition name="page" mode="out-in">
      <component :is="Component" />
    </Transition>
  </RouterView>
  <ToastHost />
</template>

<style>
.page-enter-active,
.page-leave-active {
  transition: opacity 0.18s ease;
}
.page-enter-from,
.page-leave-to {
  opacity: 0;
}
</style>
