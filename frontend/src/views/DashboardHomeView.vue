<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight, Package, Sparkles, TrendingUp, Wallet } from '@lucide/vue'
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
  <div class="mx-auto max-w-6xl space-y-8">
    <!-- Welcome card -->
    <div
      class="animate-gradient relative overflow-hidden rounded-3xl bg-gradient-to-r from-brand-700/80 via-brand-600/70 to-secondary-600/50 p-8 shadow-glow sm:p-10"
    >
      <div class="bg-grid pointer-events-none absolute inset-0 opacity-20" />
      <div class="relative flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
        <div>
          <p class="text-sm text-white/70">Welcome back,</p>
          <h1 class="font-display mt-1 text-2xl font-bold text-white sm:text-3xl">
            {{ firstName }} 👋
          </h1>
          <p class="mt-2 max-w-md text-sm text-white/75">
            Ready to grow today? Pick a service, pay with KHQR and watch the numbers climb.
          </p>
        </div>
        <div class="flex flex-wrap gap-3">
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

    <div class="grid gap-8 lg:grid-cols-3">
      <!-- Recent orders -->
      <div class="lg:col-span-2">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="font-display text-lg font-semibold text-white">Recent orders</h2>
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

          <ul v-else class="divide-y divide-white/[0.06]">
            <li
              v-for="order in ordersStore.orders"
              :key="order._id"
              class="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-white/[0.03]"
            >
              <div class="min-w-0">
                <p class="truncate text-sm font-medium text-white">{{ serviceName(order) }}</p>
                <p class="mt-0.5 text-xs text-white/40">
                  #{{ order.orderNumber }} · {{ formatNumber(order.quantity) }} · {{ formatRelative(order.createdAt) }}
                </p>
              </div>
              <div class="flex shrink-0 items-center gap-3">
                <span class="text-sm font-semibold text-white">{{ formatMoney(order.totalPrice) }}</span>
                <BaseBadge :tone="STATUS_TONE[order.status] ?? 'neutral'" dot>
                  {{ order.status }}
                </BaseBadge>
              </div>
            </li>
          </ul>
        </div>
      </div>

      <!-- Announcements -->
      <AnnouncementsPanel />
    </div>

    <!-- Featured services -->
    <div>
      <div class="mb-4 flex items-center justify-between">
        <h2 class="font-display text-lg font-semibold text-white">Featured services</h2>
        <button
          class="inline-flex items-center gap-1 text-sm font-medium text-brand-300 transition-colors hover:text-brand-200"
          @click="router.push('/dashboard/services')"
        >
          Browse all <ArrowRight class="h-3.5 w-3.5" />
        </button>
      </div>

      <div v-if="servicesStore.loading" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <BaseSkeleton v-for="n in 4" :key="n" class="h-56 w-full" />
      </div>

      <div v-else-if="servicesStore.featured.length" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ServiceCard
          v-for="service in servicesStore.featured"
          :key="service._id"
          :service="service"
          @buy="openBuy"
        />
      </div>
    </div>

    <BuyServiceModal
      :open="buyOpen"
      :service="buyingService"
      @close="buyOpen = false"
    />
  </div>
</template>
