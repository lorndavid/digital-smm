<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { CreditCard, ExternalLink, RefreshCcw, XCircle } from '@lucide/vue'
import { useOrdersStore } from '@/stores/orders.store'
import { ordersApi } from '@/api/orders.api'
import { paymentApi } from '@/api/payment.api'
import { useToast } from '@/composables/useToast'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BasePagination from '@/components/ui/BasePagination.vue'
import BaseSkeleton from '@/components/ui/BaseSkeleton.vue'
import BaseEmptyState from '@/components/ui/BaseEmptyState.vue'
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

const visibleOrders = computed(() => store.orders)

function serviceName(order: Order): string {
  return typeof order.service === 'object' ? order.service.name : 'Service'
}

function serviceSupports(order: Order, flag: 'refill' | 'cancel'): boolean {
  return typeof order.service === 'object' ? Boolean(order.service[flag]) : false
}

function selectFilter(filter: string): void {
  activeFilter.value = filter
  page.value = 1
  void load()
}

async function load(): Promise<void> {
  await store.fetchOrders({
    status: activeFilter.value === 'All' ? undefined : activeFilter.value,
    page: page.value,
    limit: pageSize,
  })
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

onMounted(() => void load())
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6">
    <div>
      <h1 class="font-display text-2xl font-bold text-white">Orders</h1>
      <p class="mt-1 text-sm text-white/50">Track, cancel or refill your orders in real time.</p>
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
      <BaseSkeleton v-for="n in 5" :key="n" class="h-20 w-full" />
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
        class="glass rounded-2xl p-5 shadow-card transition-all duration-300 hover:border-brand-400/30"
      >
        <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <p class="text-sm font-semibold text-white">{{ serviceName(order) }}</p>
              <BaseBadge :tone="STATUS_TONE[order.status] ?? 'neutral'" dot>
                {{ order.status }}
              </BaseBadge>
            </div>
            <p class="mt-1 text-xs text-white/40">
              #{{ order.orderNumber }} · {{ formatNumber(order.quantity) }} units ·
              {{ formatDate(order.createdAt) }}
            </p>
            <p v-if="order.link" class="mt-1 flex items-center gap-1 text-xs text-brand-300">
              <ExternalLink class="h-3 w-3" />
              <span class="max-w-xs truncate">{{ order.link }}</span>
            </p>
          </div>

          <div class="flex shrink-0 items-center gap-4">
            <div class="text-right">
              <p class="text-sm font-bold text-white">{{ formatMoney(order.totalPrice) }}</p>
              <p class="text-[11px] text-white/35">Provider #{{ order.providerOrderId ?? '—' }}</p>
            </div>
            <div class="flex gap-2">
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
            </div>
          </div>
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
