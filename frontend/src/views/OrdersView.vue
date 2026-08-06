<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronRight, CreditCard, ExternalLink, RefreshCcw, RefreshCw, XCircle } from '@lucide/vue'
import { useOrdersStore } from '@/stores/orders.store'
import { ordersApi } from '@/api/orders.api'
import { paymentApi } from '@/api/payment.api'
import { useToast } from '@/composables/useToast'
import { detectPlatform, type DetectedPlatform } from '@/utils/linkValidation'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BasePagination from '@/components/ui/BasePagination.vue'
import BaseSkeleton from '@/components/ui/BaseSkeleton.vue'
import BaseEmptyState from '@/components/ui/BaseEmptyState.vue'
import PlatformIcon from '@/components/ui/PlatformIcon.vue'
import OrderStatusTimeline from '@/components/dashboard/OrderStatusTimeline.vue'
import { ORDER_STATUSES } from '@/types/models'
import { STATUS_TONE } from '@/utils/constants'
import { formatMoney, formatNumber, formatDate } from '@/utils/format'
import type { Order } from '@/types/models'

const store = useOrdersStore()
const router = useRouter()
const toast = useToast()

const filters = ['All', ...ORDER_STATUSES]
const activeFilter = ref('All')
const page = ref(1)
const pageSize = 10
const actionId = ref<string | null>(null)
const refreshing = ref(false)

/** Statuses that never change again — live polling stops once all are terminal. */
const TERMINAL = new Set(['Completed', 'Cancelled', 'Refunded', 'Failed'])

const visibleOrders = computed(() => store.orders)
const liveActive = computed(() =>
  store.orders.some((o) => !TERMINAL.has(o.status)),
)

function serviceName(order: Order): string {
  return typeof order.service === 'object' ? order.service.name : 'Service'
}

function openDetail(order: Order): void {
  void router.push(`/dashboard/orders/${order._id}`)
}

function orderPlatform(order: Order): DetectedPlatform {
  const cat = order.service
  if (cat && typeof cat === 'object' && 'platform' in cat) {
    const p = (cat as { platform?: DetectedPlatform }).platform
    if (p && p !== 'other') return p
  }
  return detectPlatform(order.link)
}

function serviceSupports(order: Order, flag: 'refill' | 'cancel'): boolean {
  return typeof order.service === 'object' ? Boolean(order.service[flag]) : false
}

const queryParams = computed(() => ({
  status: activeFilter.value === 'All' ? undefined : activeFilter.value,
  page: page.value,
  limit: pageSize,
}))

function selectFilter(filter: string): void {
  activeFilter.value = filter
  page.value = 1
  void load()
}

async function load(): Promise<void> {
  await store.fetchOrders(queryParams.value)
}

/** Silent live refresh — no skeleton flash, no loading state. */
async function refreshSilently(): Promise<void> {
  await store.fetchOrders(queryParams.value, true)
}

async function refreshManually(): Promise<void> {
  refreshing.value = true
  try {
    await load()
    toast.success('Orders refreshed')
  } finally {
    refreshing.value = false
  }
}

async function cancelOrder(order: Order): Promise<void> {
  actionId.value = order._id
  try {
    await store.cancelOrder(order._id)
    toast.success(`Order #${order.orderNumber} cancelled`)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Failed to cancel order')
  } finally {
    actionId.value = null
  }
}

async function requestRefill(order: Order): Promise<void> {
  actionId.value = order._id
  try {
    const { refill } = await ordersApi.refill(order._id)
    toast.success(`Refill #${refill} requested`)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Failed to request refill')
  } finally {
    actionId.value = null
  }
}

/** Continues payment for an order still awaiting settlement. */
async function payOrder(order: Order): Promise<void> {
  actionId.value = order._id
  try {
    const { payment } = await paymentApi.create({ purpose: 'order', orderId: order._id })
    await router.push(`/pay/${payment.referenceId}`)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Failed to start payment')
  } finally {
    actionId.value = null
  }
}

let liveTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  void load()
  // Live polling: refresh every 5s while any order is still in flight.
  liveTimer = setInterval(() => {
    if (liveActive.value) void refreshSilently()
  }, 5000)
})

onUnmounted(() => {
  if (liveTimer) clearInterval(liveTimer)
  liveTimer = null
})
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="font-display text-2xl font-bold text-white">Orders</h1>
        <p class="mt-1 text-sm text-white/50">Track, cancel or refill your orders in real time.</p>
      </div>
      <div class="flex items-center gap-2">
        <!-- Live badge -->
        <span
          class="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-300"
          :class="{ 'animate-pulse': liveActive }"
        >
          <span class="relative flex h-2 w-2">
            <span
              v-if="liveActive"
              class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"
            />
            <span
              class="relative inline-flex h-2 w-2 rounded-full"
              :class="liveActive ? 'bg-emerald-400' : 'bg-white/30'"
            />
          </span>
          {{ liveActive ? 'Live' : 'Up to date' }}
        </span>
        <BaseButton variant="ghost" size="sm" :loading="refreshing" @click="refreshManually">
          <RefreshCw class="h-3.5 w-3.5" /> Refresh
        </BaseButton>
      </div>
    </div>

    <div class="flex gap-2 overflow-x-auto pb-1">
      <button
        v-for="filter in filters"
        :key="filter"
        class="shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-all"
        :class="
          activeFilter === filter
            ? 'bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-glow'
            : 'glass text-white/60 hover:text-white'
        "
        @click="selectFilter(filter)"
      >
        {{ filter }}
      </button>
    </div>

    <div v-if="store.loading" class="space-y-3">
      <BaseSkeleton v-for="n in 5" :key="n" class="h-24 w-full" />
    </div>

    <BaseEmptyState
      v-else-if="visibleOrders.length === 0"
      title="No orders here"
      message="Orders you place will appear in this list."
    />

    <div v-else class="space-y-3">
      <div
        v-for="order in visibleOrders"
        :key="order._id"
        class="glass group cursor-pointer rounded-2xl p-5 shadow-card transition-all duration-300 hover:border-brand-400/30 hover:shadow-glow"
        @click="openDetail(order)"
      >
        <!-- Header row -->
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div class="flex min-w-0 items-start gap-3">
            <PlatformIcon :platform="orderPlatform(order)" size="md" tile tile-class="mt-0.5 shrink-0" />
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <p class="font-semibold text-white">{{ serviceName(order) }}</p>
                <BaseBadge :tone="STATUS_TONE[order.status] ?? 'neutral'" dot>
                  {{ order.status }}
                </BaseBadge>
              </div>
              <p class="mt-1 text-xs text-white/40">
                #{{ order.orderNumber }} · {{ formatNumber(order.quantity) }} units ·
                {{ formatDate(order.createdAt) }}
              </p>
              <p v-if="order.link" class="mt-1 flex items-center gap-1 text-xs text-brand-300">
                <ExternalLink class="h-3 w-3 shrink-0" />
                <span class="max-w-[260px] truncate">{{ order.link }}</span>
              </p>
            </div>
          </div>

          <div class="flex shrink-0 items-center gap-4 sm:flex-col sm:items-end">
            <p class="font-bold text-white">{{ formatMoney(order.totalPrice) }}</p>
            <p class="text-[11px] text-white/35">Provider #{{ order.providerOrderId ?? '—' }}</p>
          </div>
          <ChevronRight class="h-5 w-5 shrink-0 text-white/25 transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-brand-300" />
        </div>

        <!-- Live status ladder + progress -->
        <div class="mt-4 border-t border-white/10 pt-4">
          <OrderStatusTimeline :order="order" />
        </div>

        <!-- Actions -->
        <div class="mt-4 flex flex-wrap items-center gap-2" @click.stop>
          <BaseButton
            v-if="order.status === 'Pending Payment'"
            size="sm"
            :loading="actionId === order._id"
            @click="payOrder(order)"
          >
            <CreditCard class="h-3.5 w-3.5" /> Pay now
          </BaseButton>
          <BaseButton
            v-if="serviceSupports(order, 'cancel') && ['Processing', 'In progress', 'Partial'].includes(order.status)"
            variant="outline"
            size="sm"
            :loading="actionId === order._id"
            @click="cancelOrder(order)"
          >
            <XCircle class="h-3.5 w-3.5" /> Cancel
          </BaseButton>
          <BaseButton
            v-if="serviceSupports(order, 'refill') && order.status === 'Completed'"
            variant="outline"
            size="sm"
            :loading="actionId === order._id"
            @click="requestRefill(order)"
          >
            <RefreshCcw class="h-3.5 w-3.5" /> Refill
          </BaseButton>
          <BaseButton variant="ghost" size="sm" @click="openDetail(order)">
            Details <ChevronRight class="h-3.5 w-3.5" />
          </BaseButton>
          <p v-if="order.error" class="ml-auto text-xs text-rose-300">{{ order.error }}</p>
        </div>
      </div>

      <BasePagination
        :page="page"
        :total="store.total"
        :limit="pageSize"
        @change="(p) => { page = p; void load() }"
      />
    </div>
  </div>
</template>
