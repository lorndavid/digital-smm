<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  ChevronRight,
  CreditCard,
  ExternalLink,
  RefreshCcw,
  RefreshCw,
  Repeat,
  XCircle,
} from '@lucide/vue'
import { useOrdersStore } from '@/stores/orders.store'
import { ordersApi } from '@/api/orders.api'
import { paymentApi } from '@/api/payment.api'
import { useToast } from '@/composables/useToast'
import { detectPlatform, type DetectedPlatform } from '@/utils/linkValidation'
import { buildOrderAgainQuery } from '@/utils/orderPrefill'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BasePagination from '@/components/ui/BasePagination.vue'
import BaseSkeleton from '@/components/ui/BaseSkeleton.vue'
import BaseSpinner from '@/components/ui/BaseSpinner.vue'
import BaseEmptyState from '@/components/ui/BaseEmptyState.vue'
import PlatformIcon from '@/components/ui/PlatformIcon.vue'
import { STATUS_SHORT_LABEL, STATUS_TONE } from '@/utils/constants'
import { formatMoney, formatNumber } from '@/utils/format'
import type { Order } from '@/types/models'

const store = useOrdersStore()
const router = useRouter()
const toast = useToast()

/** Filter chips — the five main statuses, shown with short labels. */
const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'Pending Payment', label: 'Pending' },
  { value: 'Processing', label: 'Processing' },
  { value: 'Partial', label: 'Partial' },
  { value: 'Completed', label: 'Completed' },
  { value: 'Refunded', label: 'Refunded' },
]

const activeFilter = ref('')
const page = ref(1)
const pageSize = 10
const actionId = ref<string | null>(null)
const refreshing = ref(false)

/** Statuses that never change again — live polling stops once all are terminal. */
const TERMINAL = new Set(['Completed', 'Cancelled', 'Refunded', 'Failed'])

const visibleOrders = computed(() => store.orders)
const liveActive = computed(() => store.orders.some((o) => !TERMINAL.has(o.status)))

function serviceName(order: Order): string {
  return typeof order.service === 'object' ? order.service.name : 'Service'
}

function openDetail(order: Order): void {
  void router.push(`/dashboard/orders/${order._id}`)
}

/**
 * Quick re-order straight from the list: jump to Explore Services with this
 * order's service, link, quantity and options prefilled.
 */
function orderAgain(order: Order): void {
  void router.push({ name: 'services', query: buildOrderAgainQuery(order) })
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

function canCancelOrder(order: Order): boolean {
  return (
    serviceSupports(order, 'cancel') &&
    ['Processing', 'In progress', 'Partial'].includes(order.status)
  )
}

function canRefillOrder(order: Order): boolean {
  return serviceSupports(order, 'refill') && order.status === 'Completed'
}

function isBusy(order: Order): boolean {
  return actionId.value === order._id
}

/** Compact date for the table (e.g. "Aug 10, 09:21 AM"). */
const compactDate = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function formatShortDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : compactDate.format(date)
}

const queryParams = computed(() => ({
  status: activeFilter.value || undefined,
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
  <div class="w-full space-y-6">
    <!-- Header -->
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="font-display text-2xl font-bold text-ink">Orders</h1>
        <p class="mt-1 text-sm text-ink/50">Track, cancel or refill your orders in real time.</p>
      </div>
      <div class="flex items-center gap-2">
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
              :class="liveActive ? 'bg-emerald-400' : 'bg-ink/30'"
            />
          </span>
          {{ liveActive ? 'Live' : 'Up to date' }}
        </span>
        <BaseButton variant="ghost" size="sm" :loading="refreshing" @click="refreshManually">
          <RefreshCw class="h-3.5 w-3.5" /> Refresh
        </BaseButton>
      </div>
    </div>

    <!-- Status filters -->
    <div class="flex gap-2 overflow-x-auto pb-1">
      <button
        v-for="filter in STATUS_FILTERS"
        :key="filter.value"
        class="shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-all"
        :class="
          activeFilter === filter.value
            ? 'bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-glow'
            : 'glass text-ink/60 hover:text-ink'
        "
        @click="selectFilter(filter.value)"
      >
        {{ filter.label }}
      </button>
    </div>

    <!-- Loading -->
    <div v-if="store.loading" class="space-y-3">
      <BaseSkeleton v-for="n in 5" :key="n" class="h-12 w-full" />
    </div>

    <!-- Empty -->
    <BaseEmptyState
      v-else-if="visibleOrders.length === 0"
      title="No orders here"
      message="Orders you place will appear in this list."
    />

    <!-- Table -->
    <div v-else class="glass overflow-hidden rounded-2xl shadow-card">
      <div class="overflow-x-auto">
        <table class="w-full min-w-[960px] text-left text-sm">
          <thead>
            <tr class="border-b border-ink/10 text-[11px] uppercase tracking-wider text-ink/40">
              <th class="px-5 py-3.5 font-medium">ID</th>
              <th class="px-4 py-3.5 font-medium">Date</th>
              <th class="px-4 py-3.5 font-medium">Link</th>
              <th class="px-4 py-3.5 text-right font-medium">Charge</th>
              <th class="px-4 py-3.5 text-right font-medium">Start count</th>
              <th class="px-4 py-3.5 text-right font-medium">Quantity</th>
              <th class="px-4 py-3.5 font-medium">Service</th>
              <th class="px-4 py-3.5 font-medium">Status</th>
              <th class="px-4 py-3.5 text-right font-medium">Remains</th>
              <th class="px-5 py-3.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="order in visibleOrders"
              :key="order._id"
              class="group cursor-pointer border-b border-ink/[0.06] transition-colors last:border-b-0 hover:bg-ink/[0.03]"
              @click="openDetail(order)"
            >
              <td class="px-5 py-3.5">
                <span class="font-mono text-xs font-semibold text-ink/70">#{{ order.orderNumber }}</span>
              </td>
              <td class="whitespace-nowrap px-4 py-3.5 text-ink/60">
                {{ formatShortDate(order.createdAt) }}
              </td>
              <td class="px-4 py-3.5">
                <span class="flex max-w-[180px] items-center gap-1.5 text-xs text-ink/55">
                  <ExternalLink class="h-3.5 w-3.5 shrink-0 text-ink/30" />
                  <span class="truncate">{{ order.link || '—' }}</span>
                </span>
              </td>
              <td class="px-4 py-3.5 text-right font-semibold tabular-nums text-ink">
                {{ formatMoney(order.totalPrice) }}
              </td>
              <td class="px-4 py-3.5 text-right tabular-nums text-ink/60">
                {{ order.startCount > 0 ? formatNumber(order.startCount) : '—' }}
              </td>
              <td class="px-4 py-3.5 text-right font-medium tabular-nums text-ink">
                {{ formatNumber(order.quantity) }}
              </td>
              <td class="px-4 py-3.5">
                <span class="flex max-w-[220px] items-center gap-2">
                  <PlatformIcon :platform="orderPlatform(order)" size="xs" tile class="shrink-0" />
                  <span class="truncate font-medium text-ink">{{ serviceName(order) }}</span>
                </span>
              </td>
              <td class="px-4 py-3.5">
                <BaseBadge :tone="STATUS_TONE[order.status] ?? 'neutral'" dot>
                  {{ STATUS_SHORT_LABEL[order.status] ?? order.status }}
                </BaseBadge>
              </td>
              <td class="px-4 py-3.5 text-right tabular-nums text-ink/60">
                {{ order.remains > 0 ? formatNumber(order.remains) : '—' }}
              </td>
              <td class="px-5 py-3.5 text-right" @click.stop>
                <div class="flex items-center justify-end gap-0.5">
                  <button
                    class="flex h-8 w-8 items-center justify-center rounded-lg text-ink/45 transition-colors hover:bg-brand-500/10 hover:text-brand-600 dark:hover:text-brand-300"
                    :title="`Order again #${order.orderNumber}`"
                    aria-label="Order again"
                    @click="orderAgain(order)"
                  >
                    <Repeat class="h-4 w-4" />
                  </button>
                  <button
                    v-if="order.status === 'Pending Payment'"
                    class="flex h-8 w-8 items-center justify-center rounded-lg text-ink/45 transition-colors hover:bg-brand-500/10 hover:text-brand-600 dark:hover:text-brand-300"
                    :title="`Pay order #${order.orderNumber}`"
                    aria-label="Pay now"
                    :disabled="isBusy(order)"
                    @click="payOrder(order)"
                  >
                    <BaseSpinner v-if="isBusy(order)" class="h-4 w-4" />
                    <CreditCard v-else class="h-4 w-4" />
                  </button>
                  <button
                    v-if="canCancelOrder(order)"
                    class="flex h-8 w-8 items-center justify-center rounded-lg text-ink/45 transition-colors hover:bg-rose-500/10 hover:text-rose-400 dark:hover:text-rose-300"
                    :title="`Cancel order #${order.orderNumber}`"
                    aria-label="Cancel order"
                    :disabled="isBusy(order)"
                    @click="cancelOrder(order)"
                  >
                    <BaseSpinner v-if="isBusy(order)" class="h-4 w-4" />
                    <XCircle v-else class="h-4 w-4" />
                  </button>
                  <button
                    v-if="canRefillOrder(order)"
                    class="flex h-8 w-8 items-center justify-center rounded-lg text-ink/45 transition-colors hover:bg-emerald-500/10 hover:text-emerald-500 dark:hover:text-emerald-300"
                    :title="`Request refill for order #${order.orderNumber}`"
                    aria-label="Request refill"
                    :disabled="isBusy(order)"
                    @click="requestRefill(order)"
                  >
                    <BaseSpinner v-if="isBusy(order)" class="h-4 w-4" />
                    <RefreshCcw v-else class="h-4 w-4" />
                  </button>
                  <ChevronRight
                    class="h-4 w-4 text-ink/25 transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-brand-300"
                  />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="border-t border-ink/10 px-5 pb-4">
        <BasePagination
          :page="page"
          :total="store.total"
          :limit="pageSize"
          @change="(p) => { page = p; void load() }"
        />
      </div>
    </div>
  </div>
</template>
