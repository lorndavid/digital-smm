<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Menu, Wallet } from '@lucide/vue'
import { useWalletStore } from '@/stores/wallet.store'
import BrandLogo from '@/components/layout/BrandLogo.vue'
import AccountMenu from '@/components/layout/AccountMenu.vue'
import ThemeToggle from '@/components/ui/ThemeToggle.vue'
import { formatMoney } from '@/utils/format'

defineEmits<{ toggle: [] }>()

const route = useRoute()
const router = useRouter()
const walletStore = useWalletStore()

const TITLES: Record<string, string> = {
  dashboard: 'Dashboard',
  services: 'Explore Services',
  orders: 'Orders',
  'order-detail': 'Order Details',
  wallet: 'Wallet',
  payments: 'Payments',
  profile: 'Profile',
  settings: 'Settings',
}

const pageTitle = computed(() => TITLES[String(route.name ?? '')] ?? 'Dashboard')

function goWallet(): void {
  void router.push('/dashboard/wallet')
}

onMounted(() => {
  void walletStore.fetchWallet().catch(() => undefined)
})
</script>

<template>
  <header class="glass-strong sticky top-0 z-30 border-b border-line">
    <div
      class="flex h-14 items-center gap-2 px-4 sm:gap-2.5 sm:px-5"
    >
    <!-- Mobile: menu + brand -->
    <button
      class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink/70 transition-colors hover:bg-ink/5 lg:hidden"
      aria-label="Open menu"
      @click="$emit('toggle')"
    >
      <Menu class="h-5 w-5" />
    </button>
    <BrandLogo size="sm" class="lg:hidden" />

    <!-- Desktop: current page title (a plain span — the page keeps its own h1) -->
    <div class="hidden min-w-0 lg:block">
      <p class="truncate font-display text-sm font-semibold text-ink">{{ pageTitle }}</p>
    </div>

    <div class="ml-auto flex items-center gap-2 sm:gap-3">
      <!-- Wallet balance chip -->
      <button
        class="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-soft px-2.5 text-[13px] font-semibold text-ink/80 transition-colors hover:border-emerald-400/40 hover:text-ink sm:px-2.5"
        aria-label="Wallet balance"
        :title="`Wallet balance: ${formatMoney(walletStore.wallet?.balance ?? 0)}`"
        @click="goWallet"
      >
        <Wallet class="h-4 w-4 text-emerald-500 dark:text-emerald-300" />
        <span class="tabular-nums max-sm:hidden">
          {{ walletStore.loading && !walletStore.wallet ? '…' : formatMoney(walletStore.wallet?.balance ?? 0) }}
        </span>
      </button>

      <ThemeToggle />
      <AccountMenu />
    </div>
    </div>
  </header>
</template>
