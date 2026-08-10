<script setup lang="ts">
import { ref } from 'vue'
import DashboardSidebar from '@/components/dashboard/DashboardSidebar.vue'
import DashboardTopbar from '@/components/dashboard/DashboardTopbar.vue'

const mobileOpen = ref(false)
</script>

<template>
  <div class="flex min-h-screen">
    <!-- Desktop sidebar -->
    <div class="fixed inset-y-0 left-0 z-40 hidden lg:block">
      <DashboardSidebar />
    </div>

    <!-- Mobile drawer -->
    <Transition name="drawer">
      <div v-if="mobileOpen" class="fixed inset-0 z-50 lg:hidden">
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="mobileOpen = false" />
        <div class="absolute inset-y-0 left-0">
          <DashboardSidebar />
        </div>
      </div>
    </Transition>

    <div class="flex min-w-0 flex-1 flex-col lg:pl-64">
      <DashboardTopbar @toggle="mobileOpen = !mobileOpen" />
      <main class="flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style>
.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.2s ease;
}
.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}
</style>
