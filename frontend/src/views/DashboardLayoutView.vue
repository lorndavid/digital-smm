<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import DashboardSidebar from '@/components/dashboard/DashboardSidebar.vue'
import DashboardTopbar from '@/components/dashboard/DashboardTopbar.vue'

const route = useRoute()
const mobileOpen = ref(false)

// Auto-close the mobile drawer after any navigation completes — tapping a
// sidebar link (or an "order again" shortcut) hides the nav on phones.
watch(
  () => route.fullPath,
  () => {
    mobileOpen.value = false
  },
)

// Escape also closes the drawer, matching standard drawer/overlay UX.
function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') mobileOpen.value = false
}
watch(mobileOpen, (open) => {
  if (open) window.addEventListener('keydown', onKeydown)
  else window.removeEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="flex min-h-screen">
    <!-- Desktop sidebar -->
    <div class="fixed inset-y-0 left-0 z-40 hidden lg:block">
      <DashboardSidebar />
    </div>

    <!-- Mobile drawer -->
    <Transition name="drawer">
      <div v-if="mobileOpen" class="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="mobileOpen = false" />
        <div class="drawer-panel absolute inset-y-0 left-0">
          <DashboardSidebar />
        </div>
      </div>
    </Transition>

    <div class="flex min-w-0 flex-1 flex-col lg:pl-60">
      <DashboardTopbar @toggle="mobileOpen = !mobileOpen" />
      <main class="flex-1 px-4 py-5 sm:px-5 lg:px-6">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style>
/* Backdrop fades in/out */
.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.2s ease;
}
.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}

/* Panel slides in from the left edge while the backdrop fades */
.drawer-enter-active .drawer-panel,
.drawer-leave-active .drawer-panel {
  transition: transform 0.25s cubic-bezier(0.22, 1, 0.36, 1);
}
.drawer-enter-from .drawer-panel,
.drawer-leave-to .drawer-panel {
  transform: translateX(-100%);
}
</style>
