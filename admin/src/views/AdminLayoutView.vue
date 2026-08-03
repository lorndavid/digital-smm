<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { UserButton } from '@clerk/vue'
import { Menu, X } from '@lucide/vue'
import {
  BarChart3,
  FolderTree,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Package,
  Receipt,
  Settings,
  Users,
  Zap,
} from '@lucide/vue'
import { useClerk } from '@clerk/vue'

const route = useRoute()
const router = useRouter()
const clerk = useClerk()
const mobileOpen = ref(false)

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/services', label: 'Services', icon: Package },
  { to: '/categories', label: 'Categories', icon: FolderTree },
  { to: '/users', label: 'Users', icon: Users },
  { to: '/orders', label: 'Orders', icon: BarChart3 },
  { to: '/payments', label: 'Payments', icon: Receipt },
  { to: '/announcements', label: 'Announcements', icon: Megaphone },
  { to: '/settings', label: 'Settings', icon: Settings },
]

function isActive(item: { to: string; exact?: boolean }): boolean {
  return item.exact ? route.path === item.to : route.path.startsWith(item.to)
}

async function signOut(): Promise<void> {
  await clerk.value?.signOut()
  router.push('/login')
}
</script>

<template>
  <div class="flex min-h-screen">
    <!-- Sidebar -->
    <div class="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block">
      <aside class="flex h-full w-64 flex-col border-r border-white/10 bg-night-soft/60 backdrop-blur-xl">
        <div class="flex h-16 items-center gap-2 border-b border-white/10 px-5">
          <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-secondary-500 shadow-glow">
            <Zap class="h-4 w-4 text-white" fill="currentColor" />
          </div>
          <span class="font-display text-lg font-bold text-white">
            Vid<span class="text-gradient">SMM</span> <span class="text-xs font-semibold text-white/40">ADMIN</span>
          </span>
        </div>

        <nav class="flex-1 space-y-1 overflow-y-auto px-3 py-5">
          <router-link
            v-for="item in nav"
            :key="item.to"
            :to="item.to"
            class="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all"
            :class="isActive(item) ? 'bg-gradient-to-r from-brand-500/20 to-transparent text-white' : 'text-white/55 hover:bg-white/5 hover:text-white'"
          >
            <component :is="item.icon" class="h-[18px] w-[18px]" />
            {{ item.label }}
          </router-link>
        </nav>

        <div class="border-t border-white/10 p-4">
          <button
            class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/55 transition-colors hover:bg-white/5 hover:text-white"
            @click="signOut"
          >
            <LogOut class="h-[18px] w-[18px]" /> Sign out
          </button>
        </div>
      </aside>
    </div>

    <!-- Mobile drawer -->
    <Transition name="drawer">
      <div v-if="mobileOpen" class="fixed inset-0 z-50 lg:hidden">
        <div class="absolute inset-0 bg-night/80 backdrop-blur-sm" @click="mobileOpen = false" />
        <div class="absolute inset-y-0 left-0">
          <aside class="flex h-full w-64 flex-col border-r border-white/10 bg-night-soft/95 backdrop-blur-xl">
            <div class="flex h-16 items-center justify-between border-b border-white/10 px-5">
              <span class="font-display text-lg font-bold text-white">
                Vid<span class="text-gradient">SMM</span> <span class="text-xs font-semibold text-white/40">ADMIN</span>
              </span>
              <button class="text-white/60" @click="mobileOpen = false"><X class="h-5 w-5" /></button>
            </div>
            <nav class="flex-1 space-y-1 overflow-y-auto px-3 py-5">
              <router-link
                v-for="item in nav"
                :key="item.to"
                :to="item.to"
                class="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium"
                :class="isActive(item) ? 'bg-brand-500/20 text-white' : 'text-white/55'"
                @click="mobileOpen = false"
              >
                <component :is="item.icon" class="h-[18px] w-[18px]" />
                {{ item.label }}
              </router-link>
            </nav>
          </aside>
        </div>
      </div>
    </Transition>

    <!-- Content -->
    <div class="flex min-w-0 flex-1 flex-col lg:pl-64">
      <header class="glass-strong sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/10 px-4 lg:px-8">
        <button class="flex h-10 w-10 items-center justify-center rounded-xl text-white/80 lg:hidden" @click="mobileOpen = true">
          <Menu class="h-5 w-5" />
        </button>
        <div class="hidden text-sm text-white/50 lg:block">
          VidSMM <span class="mx-1 text-white/25">/</span> Admin Panel
        </div>
        <UserButton />
      </header>
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
