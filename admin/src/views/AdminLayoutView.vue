<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Menu, X } from '@lucide/vue'
import {
  Activity,
  BarChart3,
  FolderTree,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Moon,
  Package,
  Receipt,
  RotateCcw,
  Settings,
  ShieldAlert,
  Sun,
  Users,
} from '@lucide/vue'
import { useAuthStore } from '@/stores/auth.store'
import { KeyRound } from '@lucide/vue'
import { getTheme, toggleTheme } from '@/utils/theme'
import logoUrl from '@/assets/logo.png'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const mobileOpen = ref(false)
const theme = ref(getTheme())

interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
  exact?: boolean
  superOnly?: boolean
}

interface NavGroup {
  title: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    title: 'Overview',
    items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true }],
  },
  {
    title: 'Catalog',
    items: [
      { to: '/services', label: 'Services', icon: Package },
      { to: '/categories', label: 'Categories', icon: FolderTree },
    ],
  },
  {
    title: 'Operations',
    items: [
      { to: '/orders', label: 'Orders', icon: BarChart3 },
      { to: '/payments', label: 'Payments', icon: Receipt },
      { to: '/users', label: 'Users', icon: Users },
      { to: '/admins', label: 'Admins & Roles', icon: KeyRound, superOnly: true },
    ],
  },
  {
    title: 'Engagement',
    items: [{ to: '/announcements', label: 'Announcements', icon: Megaphone }],
  },
  {
    title: 'Insights',
    items: [{ to: '/analytics', label: 'Analytics', icon: BarChart3 }],
  },
  {
    title: 'System',
    items: [
      { to: '/system/health', label: 'System Health', icon: Activity },
      { to: '/system/incidents', label: 'Incidents', icon: ShieldAlert },
      { to: '/system/deployments', label: 'Deployments', icon: RotateCcw },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
]

function isActive(item: NavItem): boolean {
  return item.exact ? route.path === item.to : route.path.startsWith(item.to)
}

function visible(item: NavItem): boolean {
  return !item.superOnly || authStore.isSuperAdmin
}

function onToggleTheme(): void {
  theme.value = toggleTheme()
}

function signOut(): void {
  authStore.logout()
  router.push('/login')
}

/** Current page title, derived from the active nav item. */
const pageTitle = computed(() => {
  for (const group of navGroups) {
    for (const item of group.items) {
      if (item.exact ? route.path === item.to : route.path.startsWith(item.to)) return item.label
    }
  }
  return 'Admin Panel'
})
</script>

<template>
  <div class="flex min-h-screen">
    <!-- Desktop sidebar -->
    <div class="fixed inset-y-0 left-0 z-40 hidden w-60 lg:block">
      <aside class="flex h-full w-60 flex-col border-r border-(--a-border) bg-(--a-sidebar) backdrop-blur-xl">
        <div class="flex h-16 items-center justify-between border-b border-(--a-border) px-4">
          <div class="flex items-center gap-2">
            <img :src="logoUrl" alt="DigitalSMM" class="block h-12 w-auto object-contain" />
            <span class="rounded-md bg-brand-500/15 px-2 py-0.5 text-[10px] font-bold tracking-wider text-brand-300">
              ADMIN
            </span>
          </div>
        </div>

        <nav class="flex-1 space-y-4 overflow-y-auto px-2.5 py-3">
          <div v-for="group in navGroups" :key="group.title" class="space-y-0.5">
            <p class="px-2.5 pb-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-(--a-muted-3)">
              {{ group.title }}
            </p>
            <router-link
              v-for="item in group.items"
              :key="item.to"
              :to="item.to"
              class="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-all"
              :class="
                isActive(item)
                  ? 'bg-gradient-to-r from-brand-500/15 to-transparent text-brand-300'
                  : 'text-(--a-muted) hover:bg-(--a-soft) hover:text-(--a-text)'
              "
              v-show="visible(item)"
            >
              <component :is="item.icon" class="h-4 w-4" />
              {{ item.label }}
              <span
                v-if="item.superOnly"
                class="ml-auto rounded-md bg-brand-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-brand-300"
              >
                ROOT
              </span>
            </router-link>
          </div>
        </nav>

        <div class="border-t border-(--a-border) p-3">
          <button
            class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-(--a-muted) transition-colors hover:bg-(--a-soft) hover:text-(--a-text)"
            @click="signOut"
          >
            <LogOut class="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>
    </div>

    <!-- Mobile drawer -->
    <Transition name="drawer">
      <div v-if="mobileOpen" class="fixed inset-0 z-50 lg:hidden">
        <div class="absolute inset-0 bg-night/80 backdrop-blur-sm" @click="mobileOpen = false" />
        <div class="absolute inset-y-0 left-0">
          <aside class="flex h-full w-64 flex-col border-r border-(--a-border) bg-(--a-sidebar) backdrop-blur-xl">
            <div class="flex h-16 items-center justify-between border-b border-(--a-border) px-4">
              <div class="flex items-center gap-2">
                <img :src="logoUrl" alt="DigitalSMM" class="block h-12 w-auto object-contain" />
                <span class="rounded-md bg-brand-500/15 px-2 py-0.5 text-[10px] font-bold tracking-wider text-brand-300">
                  ADMIN
                </span>
              </div>
              <button class="text-(--a-muted)" @click="mobileOpen = false"><X class="h-5 w-5" /></button>
            </div>
            <nav class="flex-1 space-y-4 overflow-y-auto px-2.5 py-3">
              <div v-for="group in navGroups" :key="group.title" class="space-y-0.5">
                <p class="px-2.5 pb-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-(--a-muted-3)">
                  {{ group.title }}
                </p>
                <router-link
                  v-for="item in group.items"
                  :key="item.to"
                  :to="item.to"
                  class="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium"
                  :class="isActive(item) ? 'bg-brand-500/15 text-brand-300' : 'text-(--a-muted)'"
                  v-show="visible(item)"
                  @click="mobileOpen = false"
                >
                  <component :is="item.icon" class="h-4 w-4" />
                  {{ item.label }}
                </router-link>
              </div>
            </nav>
          </aside>
        </div>
      </div>
    </Transition>

    <!-- Content -->
    <div class="flex min-w-0 flex-1 flex-col lg:pl-60">
      <header class="glass-strong sticky top-0 z-30 flex h-14 items-center justify-between border-b border-(--a-border) px-4 lg:px-6">
        <button class="flex h-9 w-9 items-center justify-center rounded-lg text-(--a-text-soft) lg:hidden" @click="mobileOpen = true">
          <Menu class="h-5 w-5" />
        </button>
        <div class="hidden text-sm text-(--a-muted) lg:block">
          DigitalSMM <span class="mx-1 text-(--a-muted-3)">/</span>
          <span class="font-medium text-(--a-text)">{{ pageTitle }}</span>
        </div>
        <div class="flex items-center gap-3">
          <button
            class="flex h-9 w-9 items-center justify-center rounded-xl border border-(--a-border) text-(--a-muted) transition-colors hover:border-brand-400/50 hover:text-brand-300"
            :title="theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
            @click="onToggleTheme"
          >
            <Moon v-if="theme === 'light'" class="h-4 w-4" />
            <Sun v-else class="h-4 w-4" />
          </button>
          <div class="hidden items-center gap-2.5 sm:flex">
            <div class="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-secondary-500 text-xs font-bold text-white">
              {{ (authStore.admin?.name || authStore.admin?.email || 'A').slice(0, 2).toUpperCase() }}
            </div>
            <div class="leading-tight">
              <p class="max-w-[180px] truncate text-xs font-semibold text-(--a-text)">
                {{ authStore.admin?.name || authStore.admin?.email }}
              </p>
              <p class="text-[11px] text-secondary-300">
                {{ authStore.isSuperAdmin ? 'Super admin' : 'Admin' }}
              </p>
            </div>
          </div>
          <button
            class="flex h-9 items-center gap-1.5 rounded-xl border border-(--a-border) px-3 text-xs font-semibold text-(--a-muted) transition-colors hover:border-rose-400/40 hover:text-rose-300"
            title="Sign out"
            @click="signOut"
          >
            <LogOut class="h-3.5 w-3.5" />
            <span class="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>
      <main class="flex-1 px-4 py-5 sm:px-5 lg:px-6">
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
