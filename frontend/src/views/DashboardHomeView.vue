<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight, Package, Sparkles, TrendingUp, User, Wallet } from '@lucide/vue'
import { useAuthStore } from '@/stores/auth.store'
import { useServicesStore } from '@/stores/services.store'
import { useOrdersStore } from '@/stores/orders.store'
import { useWalletStore } from '@/stores/wallet.store'
import { useAnnouncementsStore } from '@/stores/announcements.store'
import StatCard from '@/components/dashboard/StatCard.vue'
import ServiceCard from '@/components/dashboard/ServiceCard.vue'
import AnnouncementsPanel from '@/components/dashboard/AnnouncementsPanel.vue'
import BuyServiceModal from '@/components/dashboard/BuyServiceModal.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import BaseSkeleton from '@/components/ui/BaseSkeleton.vue'
import BaseEmptyState from '@/components/ui/BaseEmptyState.vue'
import { STATUS_TONE } from '@/utils/constants'
import { formatMoney, formatNumber, formatRelative } from '@/utils/format'
import type { Order, Service } from '@/types/models'

const router = useRouter()
const servicesStore = useServicesStore()
const ordersStore = useOrdersStore()
const walletStore = useWalletStore()
const announcements = useAnnouncementsStore()
const authStore = useAuthStore()

const buyingService = ref<Service | null>(null)
const buyOpen = ref(false)

const firstName = computed(() => {
  const full = authStore.user?.name ?? ''
  return full.split(' ')[0] || 'there'
})

const activeOrders = computed(
  () =>
    ordersStore.orders.filter((o) =>
      ['Processing', 'In progress', 'Partial'].includes(o.status),
    ).length,
)
const completedOrders = computed(
  () => ordersStore.orders.filter((o) => o.status === 'Completed').length,
)

function serviceName(order: Order): string {
  return typeof order.service === 'object' ? order.service.name : 'Service'
}

function openBuy(service: Service): void {
  buyingService.value = service
  buyOpen.value = true
}

/** Quick-action shortcuts for the home page. */
const quickActions = [
  { label: 'Explore services', to: '/dashboard/services', icon: Sparkles },
  { label: 'My orders', to: '/dashboard/orders', icon: Package },
  { label: 'Top up wallet', to: '/dashboard/wallet', icon: Wallet },
  { label: 'Edit profile', to: '/dashboard/profile', icon: User },
]

onMounted(async () => {
  await Promise.allSettled([
    servicesStore.fetchFeatured(),
    ordersStore.fetchOrders({ limit: 5 }),
    walletStore.fetchWallet(),
    announcements.fetchAnnouncements(),
  ])
})
</script>

<template>
  <div class="w-full space-y-6">
    <!-- Welcome card -->
    <div
      class="animate-gradient relative overflow-hidden rounded-2xl bg-gradient-to-r from-brand-500/10 via-brand-400/5 to-secondary-500/10 p-6 shadow-card sm:p-7 dark:from-brand-700/80 dark:via-brand-600/70 dark:to-secondary-600/50 dark:shadow-glow"
    >
      <div class="bg-grid pointer-events-none absolute inset-0 opacity-20" />
      <div class="relative flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p class="text-[13px] text-ink/70">Welcome back,</p>
          <h1 class="font-display mt-0.5 text-xl font-bold text-ink sm:text-2xl">
            {{ firstName }} 👋
          </h1>
          <p class="mt-1 max-w-md text-sm text-ink/75">
            Ready to grow today? Pick a service, order instantly from your wallet balance.
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <BaseButton variant="secondary" @click="router.push('/dashboard/services')">
            <Sparkles class="h-4 w-4" /> Explore Services
          </BaseButton>
          <BaseButton variant="outline" @click="router.push('/dashboard/wallet')">
            <Wallet class="h-4 w-4" /> Top up wallet
          </BaseButton>
        </div>
      </div>
    </div>

    <!-- Stats -->
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Wallet balance"
        :value="formatMoney(walletStore.wallet?.balance ?? 0)"
        :icon="Wallet"
        accent="from-emerald-400/25 to-emerald-500/15 text-emerald-300"
      />
      <StatCard
        label="Total orders"
        :value="formatNumber(ordersStore.total)"
        :icon="Package"
        accent="from-brand-500/25 to-secondary-500/20 text-brand-300"
      />
      <StatCard
        label="Active orders"
        :value="String(activeOrders)"
        :icon="TrendingUp"
        accent="from-sky-400/25 to-blue-500/15 text-sky-300"
      />
      <StatCard
        label="Completed"
        :value="String(completedOrders)"
        :icon="Sparkles"
        accent="from-amber-400/25 to-orange-500/15 text-amber-300"
      />
    </div>

    <!-- Two-column content: main feed + side panel -->
    <div class="grid gap-5 lg:grid-cols-3">
      <!-- Left: recent orders + featured services -->
      <div class="min-w-0 space-y-6 lg:col-span-2">
        <!-- Recent orders -->
        <div>
          <div class="mb-3 flex items-center justify-between">
            <h2 class="font-display text-base font-semibold text-ink">Recent orders</h2>
            <button
              class="inline-flex items-center gap-1 text-sm font-medium text-brand-300 transition-colors hover:text-brand-200"
              @click="router.push('/dashboard/orders')"
            >
              View all <ArrowRight class="h-3.5 w-3.5" />
            </button>
          </div>

          <div class="glass rounded-2xl shadow-card">
            <div v-if="ordersStore.loading" class="space-y-3 p-6">
              <BaseSkeleton v-for="n in 3" :key="n" class="h-14 w-full" />
            </div>

            <BaseEmptyState
              v-else-if="ordersStore.orders.length === 0"
              title="No orders yet"
              message="Place your first order and it will show up here."
            >
              <BaseButton class="mt-2" size="sm" @click="router.push('/dashboard/services')">
                Explore services
              </BaseButton>
            </BaseEmptyState>

            <ul v-else class="divide-y divide-ink/[0.06]">
              <li
                v-for="order in ordersStore.orders"
                :key="order._id"
                class="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-ink/[0.03]"
              >
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium text-ink">{{ serviceName(order) }}</p>
                  <p class="mt-0.5 text-xs text-ink/40">
                    #{{ order.orderNumber }} · {{ formatNumber(order.quantity) }} · {{ formatRelative(order.createdAt) }}
                  </p>
                </div>
                <div class="flex shrink-0 items-center gap-3">
                  <span class="text-sm font-semibold text-ink">{{ formatMoney(order.totalPrice) }}</span>
                  <BaseBadge :tone="STATUS_TONE[order.status] ?? 'neutral'" dot>
                    {{ order.status }}
                  </BaseBadge>
                </div>
              </li>
            </ul>
          </div>
        </div>

        <!-- Featured services -->
        <div>
          <div class="mb-3 flex items-center justify-between">
            <h2 class="font-display text-base font-semibold text-ink">Featured services</h2>
            <button
              class="inline-flex items-center gap-1 text-sm font-medium text-brand-300 transition-colors hover:text-brand-200"
              @click="router.push('/dashboard/services')"
            >
              Browse all <ArrowRight class="h-3.5 w-3.5" />
            </button>
          </div>

          <div
            v-if="servicesStore.loading"
            class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
          >
            <BaseSkeleton v-for="n in 6" :key="n" class="h-56 w-full" />
          </div>

          <div
            v-else-if="servicesStore.featured.length"
            class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
          >
            <ServiceCard
              v-for="service in servicesStore.featured"
              :key="service._id"
              :service="service"
              @buy="openBuy"
            />
          </div>
        </div>
      </div>

      <!-- Right: announcements + quick actions -->
      <div class="min-w-0 space-y-6">
        <AnnouncementsPanel />

        <div class="glass rounded-xl p-5 shadow-card">
          <h3 class="font-display text-sm font-semibold text-ink">Quick actions</h3>
          <div class="mt-3 space-y-2">
            <button
              v-for="action in quickActions"
              :key="action.label"
              class="group flex w-full items-center gap-2.5 rounded-lg border border-ink/10 bg-soft px-3 py-2 text-[13px] font-medium text-ink/75 transition-all hover:border-brand-400/40 hover:text-ink"
              @click="router.push(action.to)"
            >
              <component :is="action.icon" class="h-4 w-4 text-brand-300 transition-transform group-hover:scale-110" />
              {{ action.label }}
              <ArrowRight class="ml-auto h-3.5 w-3.5 text-ink/25 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-300" />
            </button>
          </div>
          <p class="mt-3 border-t border-ink/10 pt-3 text-xs leading-relaxed text-ink/40">
            Tip: top up your wallet and services are paid instantly from your balance.
          </p>
        </div>
      </div>
    </div>

    <BuyServiceModal
      :open="buyOpen"
      :service="buyingService"
      @close="buyOpen = false"
    />
  </div>
</template>
