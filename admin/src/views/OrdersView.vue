<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Search } from '@lucide/vue'
import { adminApi } from '@/api/admin.api'
import { useToast } from '@/composables/useToast'
import { errorMessage, formatDate, formatMoney, formatNumber } from '@/utils/format'
import { STATUS_LABEL, STATUS_TONE } from '@/utils/constants'
import { ORDER_STATUSES, type Order } from '@/types/models'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import BaseSkeleton from '@/components/ui/BaseSkeleton.vue'
import BaseEmptyState from '@/components/ui/BaseEmptyState.vue'

const toast = useToast()

const items = ref<Order[]>([])
const total = ref(0)
const loading = ref(true)
const search = ref('')
const status = ref('')
const page = ref(1)
const pageSize = 15
const updatingId = ref<string | null>(null)

const statusOptions = ORDER_STATUSES.map((s) => ({ value: s, label: s }))

function userName(order: Order): string {
  return typeof order.user === 'object' ? (order.user.name || order.user.email) : '—'
}

function serviceName(order: Order): string {
  return typeof order.service === 'object' ? order.service.name : 'Service'
}

async function load(): Promise<void> {
  loading.value = true
  try {
    const result = await adminApi.listOrders({
      page: page.value,
      limit: pageSize,
      search: search.value || undefined,
      status: status.value || undefined,
    })
    items.value = result.items
    total.value = result.total
  } catch (err) {
    toast.error(errorMessage(err, 'Failed to load orders'))
  } finally {
    loading.value = false
  }
}

async function updateStatus(order: Order, event: Event): Promise<void> {
  const next = (event.target as HTMLSelectElement).value as Order['status']
  if (next === order.status) return
  updatingId.value = order._id
  try {
    await adminApi.updateOrderStatus(order._id, next)
    toast.success(`Order #${order.orderNumber} → ${next}`)
    await load()
  } catch (err) {
    toast.error(errorMessage(err, 'Failed to update status'))
  } finally {
    updatingId.value = null
  }
}

onMounted(() => void load())
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-5">
    <div>
      <h1 class="font-display text-2xl font-bold text-(--a-text)">Orders</h1>
      <p class="mt-1 text-sm text-(--a-muted)">Monitor and update order statuses. ({{ total }} orders)</p>
    </div>

    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="relative max-w-xs flex-1">
        <Search class="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-(--a-muted-3)" />
        <input
          v-model="search"
          type="search"
          placeholder="Search order number…"
          class="h-11 w-full rounded-xl border border-(--a-border) bg-(--a-soft) pl-10 pr-4 text-sm text-(--a-text) placeholder:text-(--a-muted-3) focus:border-brand-400/60 focus:outline-none focus:ring-2 focus:ring-brand-400/30"
          @keyup.enter="page = 1; void load()"
        />
      </div>
      <select
        v-model="status"
        class="h-11 rounded-xl border border-(--a-border) bg-(--a-soft) px-4 text-sm text-(--a-text) focus:border-brand-400/60 focus:outline-none [&>option]:bg-(--a-option-bg)"
        @change="page = 1; void load()"
      >
        <option value="">All statuses</option>
        <option v-for="s in ORDER_STATUSES" :key="s" :value="s">{{ s }}</option>
      </select>
    </div>

    <div v-if="loading" class="space-y-3">
      <BaseSkeleton v-for="n in 8" :key="n" class="h-16 w-full" />
    </div>

    <BaseEmptyState v-else-if="items.length === 0" title="No orders found" message="Orders will appear here once customers start buying." />

    <div v-else class="glass overflow-hidden rounded-2xl shadow-card">
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="border-b border-(--a-border) text-xs uppercase tracking-wider text-(--a-muted-2)">
            <tr>
              <th class="px-5 py-3 font-medium">Order</th>
              <th class="px-5 py-3 font-medium">Customer</th>
              <th class="px-5 py-3 font-medium">Service</th>
              <th class="px-5 py-3 font-medium">Qty</th>
              <th class="px-5 py-3 font-medium">Total</th>
              <th class="px-5 py-3 font-medium">Status</th>
              <th class="px-5 py-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-(--a-border)">
            <tr v-for="order in items" :key="order._id" class="transition-colors hover:bg-(--a-hover)">
              <td class="px-5 py-3.5 font-medium text-(--a-text)">#{{ order.orderNumber }}</td>
              <td class="px-5 py-3.5 text-(--a-muted)">{{ userName(order) }}</td>
              <td class="max-w-[220px] px-5 py-3.5">
                <p class="truncate text-(--a-muted)">{{ serviceName(order) }}</p>
                <p v-if="order.link" class="truncate text-xs text-(--a-muted-3)">{{ order.link }}</p>
              </td>
              <td class="px-5 py-3.5 text-(--a-muted)">{{ formatNumber(order.quantity) }}</td>
              <td class="px-5 py-3.5 font-semibold text-(--a-text)">{{ formatMoney(order.totalPrice) }}</td>
              <td class="px-5 py-3.5">
                <div class="flex items-center gap-2">
                  <BaseBadge :tone="STATUS_TONE[order.status] ?? 'neutral'" dot>
                    {{ STATUS_LABEL[order.status] ?? order.status }}
                  </BaseBadge>
                  <select
                    class="h-8 rounded-lg border border-(--a-border) bg-(--a-soft) px-2 text-xs text-(--a-text-soft) focus:border-brand-400/60 focus:outline-none [&>option]:bg-(--a-option-bg)"
                    :disabled="updatingId === order._id"
                    :value="order.status"
                    @change="updateStatus(order, $event)"
                  >
                    <option v-for="option in statusOptions" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </option>
                  </select>
                </div>
              </td>
              <td class="px-5 py-3.5 text-(--a-muted-2)">{{ formatDate(order.createdAt) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="Math.ceil(total / pageSize) > 1" class="flex items-center justify-center gap-3 pt-2">
      <button class="rounded-xl border border-(--a-border) px-4 py-2 text-sm text-(--a-text-soft) hover:border-brand-400/50 disabled:opacity-30" :disabled="page <= 1" @click="page--; void load()">Prev</button>
      <span class="text-sm text-(--a-muted)">Page {{ page }} / {{ Math.ceil(total / pageSize) }}</span>
      <button class="rounded-xl border border-(--a-border) px-4 py-2 text-sm text-(--a-text-soft) hover:border-brand-400/50 disabled:opacity-30" :disabled="page >= Math.ceil(total / pageSize)" @click="page++; void load()">Next</button>
    </div>
  </div>
</template>
