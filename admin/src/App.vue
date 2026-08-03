<script setup lang="ts">
import { useClerkSession } from '@/composables/useClerkSession'
import { useAuthStore } from '@/stores/auth.store'
import ToastHost from '@/components/ui/ToastHost.vue'

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
const authStore = useAuthStore()

if (publishableKey) {
  useClerkSession()
} else {
  authStore.setLoaded(true, false)
}
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
