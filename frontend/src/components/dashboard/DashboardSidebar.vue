<script setup lang="ts">
import { onMounted } from 'vue'
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
import { useWalletStore } from '@/stores/wallet.store'
import AvatarCircle from '@/components/layout/AvatarCircle.vue'
import BrandLogo from '@/components/layout/BrandLogo.vue'
import { formatMoney } from '@/utils/format'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const walletStore = useWalletStore()

onMounted(() => {
  void walletStore.fetchWallet().catch(() => undefined)
})

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
  <aside class="flex h-full w-64 flex-col border-r border-white/10 bg-night-soft/60 backdrop-blur-xl">
    <div class="flex h-16 items-center border-b border-white/10 px-5">
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
            ? 'bg-gradient-to-r from-brand-500/20 to-transparent text-white shadow-[inset_2px_0_0_0_#6c3bff]'
            : 'text-white/55 hover:bg-white/5 hover:text-white'
        "
      >
        <component :is="item.icon" class="h-[18px] w-[18px]" />
        {{ item.label }}
      </router-link>
    </div>

    <div class="border-t border-white/10 p-4">
      <div class="glass mb-3 flex items-center justify-between rounded-xl px-4 py-3">
        <div>
          <p class="text-[11px] text-white/40">Wallet balance</p>
          <p class="font-display text-sm font-bold text-white">
            {{ formatMoney(walletStore.wallet?.balance ?? 0) }}
          </p>
        </div>
        <button
          class="text-xs font-semibold text-brand-300 transition-colors hover:text-brand-200"
          @click="router.push('/dashboard/wallet')"
        >
          Top up
        </button>
      </div>

      <div class="flex items-center gap-3">
        <AvatarCircle
          :name="authStore.user?.name ?? ''"
          :email="authStore.user?.email ?? ''"
          :avatar-url="authStore.user?.avatarUrl ?? ''"
          :size="36"
        />
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-semibold text-white">
            {{ authStore.user?.name || 'VidSMM User' }}
          </p>
          <p class="truncate text-xs text-white/40">
            {{ authStore.user?.email ?? '' }}
          </p>
        </div>
        <button
          class="flex h-8 w-8 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Sign out"
          title="Sign out"
          @click="signOut"
        >
          <LogOut class="h-4 w-4" />
        </button>
      </div>
    </div>
  </aside>
</template>
