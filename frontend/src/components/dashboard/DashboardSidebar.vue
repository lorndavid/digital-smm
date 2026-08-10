<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import {
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Package,
  Receipt,
  Settings,
  User,
  Wallet,
} from '@lucide/vue'
import { useAuthStore } from '@/stores/auth.store'
import BrandLogo from '@/components/layout/BrandLogo.vue'
import ThemeToggle from '@/components/ui/ThemeToggle.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const nav = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/dashboard/services', label: 'Explore Services', icon: LayoutGrid, exact: false },
  { to: '/dashboard/orders', label: 'Orders', icon: Package, exact: false },
  { to: '/dashboard/wallet', label: 'Wallet', icon: Wallet, exact: false },
  { to: '/dashboard/payments', label: 'Payments', icon: Receipt, exact: false },
  { to: '/dashboard/profile', label: 'Profile', icon: User, exact: false },
  { to: '/dashboard/settings', label: 'Settings', icon: Settings, exact: false },
]

function isActive(item: { to: string; exact: boolean }): boolean {
  return item.exact ? route.path === item.to : route.path.startsWith(item.to)
}

async function signOut(): Promise<void> {
  await authStore.signOut()
  router.push('/')
}
</script>

<template>
  <aside class="flex h-full w-64 flex-col border-r border-ink/10 bg-card/60 backdrop-blur-xl">
    <div class="flex h-16 items-center border-b border-ink/10 px-5">
      <BrandLogo size="sm" />
    </div>

    <div class="flex-1 space-y-1 overflow-y-auto px-3 py-5">
      <router-link
        v-for="item in nav"
        :key="item.to"
        :to="item.to"
        class="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all"
        :class="
          isActive(item)
            ? 'bg-gradient-to-r from-brand-500/20 to-transparent text-ink shadow-[inset_2px_0_0_0_#6c3bff]'
            : 'text-ink/55 hover:bg-ink/5 hover:text-ink'
        "
      >
        <component :is="item.icon" class="h-[18px] w-[18px]" />
        {{ item.label }}
      </router-link>
    </div>

    <div class="border-t border-ink/10 p-4">
      <div
        class="flex items-center justify-between rounded-xl border border-ink/10 bg-ink/[0.03] px-3 py-2.5"
      >
        <p class="text-xs font-medium text-ink/50">Appearance</p>
        <ThemeToggle />
      </div>
      <button
        class="mt-3 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink/55 transition-colors hover:bg-ink/5 hover:text-rose-300"
        @click="signOut"
      >
        <LogOut class="h-[18px] w-[18px]" /> Sign out
      </button>
    </div>
  </aside>
</template>
