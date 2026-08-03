<script setup lang="ts">
import { useClerkSession } from '@/composables/useClerkSession'
import { useAuthStore } from '@/stores/auth.store'
import ToastHost from '@/components/ui/ToastHost.vue'

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
const authStore = useAuthStore()

if (publishableKey) {
  // Sync Clerk session state into the Pinia auth store.
  useClerkSession()
} else {
  // Clerk is not configured: treat the app as loaded and signed out.
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
