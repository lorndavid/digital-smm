<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Repeat, Search } from '@lucide/vue'
import { adminApi } from '@/api/admin.api'
import { useToast } from '@/composables/useToast'
import { errorMessage, formatDate, formatMoney, formatNumber } from '@/utils/format'
import { STATUS_LABEL, STATUS_TONE } from '@/utils/constants'
import { ORDER_STATUSES, type Order } from '@/types/models'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseModal from '@/components/ui/BaseModal.vue'
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
  const s = order.service
  return s && typeof s === 'object' ? (s.name ?? 'Service') : 'Service'
}

// ---------------------------------------------------------------------------
// Order detail modal + support-agent "Order again"
// ---------------------------------------------------------------------------

/** The order currently shown in the detail / re-order modal. */
const detailOrder = ref<Order | null>(null)
/** Modal step: false = full order details, true = re-order confirmation. */
const confirmStep = ref(false)
const reordering = ref(false)

/** The formatted option fields (params) of an order, e.g. "Comments · 3 items". */
const paramsSummary = computed(() => {
  const o = detailOrder.value
  if (!o?.params) return ''
  const values = Object.values(o.params).filter((v) => v !== '' && v !== null && v !== undefined)
  return values.map(String).join(' · ')
})

function openDetail(order: Order): void {
  detailOrder.value = order
  confirmStep.value = false
}

/** Opens the modal straight on the re-order confirmation step. */
function askOrderAgain(order: Order): void {
  detailOrder.value = order
  confirmStep.value = true
}

function closeDetail(): void {
  if (reordering.value) return
  detailOrder.value = null
  confirmStep.value = false
}

/**
 * Re-places the order for the SAME customer, funded from their wallet. The
 * backend rejects with an insufficient-balance error if they cannot cover it.
 */
async function confirmOrderAgain(): Promise<void> {
  const order = detailOrder.value
  if (!order) return
  reordering.value = true
  try {
    const created = await adminApi.placeOrderAgain(order._id)
    toast.success(`Order #${created.orderNumber} placed for ${userName(order)}`)
    // Clear the busy flag BEFORE closing — closeDetail() refuses to close
    // while a re-order is in flight, so a stale flag would trap the modal.
    reordering.value = false
    closeDetail()
    void load()
  } catch (err) {
    toast.error(errorMessage(err, 'Could not re-place the order'))
  } finally {
    reordering.value = false
  }
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
  <div class="w-full space-y-5">
    <div>
      <h1 class="font-display text-xl font-bold text-(--a-text)">Orders</h1>
      <p class="mt-0.5 text-sm text-(--a-muted)">Monitor and update order statuses. ({{ total }} orders)</p>
    </div>

    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="relative max-w-xs flex-1">
        <Search class="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-(--a-muted-3)" />
        <input
          v-model="search"
          type="search"
          placeholder="Search order number…"
          class="h-9.5 w-full rounded-lg border border-(--a-border) bg-(--a-soft) pl-9 pr-3.5 text-sm text-(--a-text) placeholder:text-(--a-muted-3) focus:border-brand-400/60 focus:outline-none focus:ring-2 focus:ring-brand-400/30"
          @keyup.enter="page = 1; void load()"
        />
      </div>
      <select
        v-model="status"
        class="h-9.5 rounded-lg border border-(--a-border) bg-(--a-soft) px-3.5 text-sm text-(--a-text) focus:border-brand-400/60 focus:outline-none [&>option]:bg-(--a-option-bg)"
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
        <table class="w-full text-left text-[13px]">
          <thead class="border-b border-(--a-border) text-[10px] uppercase tracking-wider text-(--a-muted-2)">
            <tr>
              <th class="px-4 py-2.5 font-medium">Order</th>
              <th class="px-4 py-2.5 font-medium">Customer</th>
              <th class="px-4 py-2.5 font-medium">Service</th>
              <th class="px-4 py-2.5 font-medium">Qty</th>
              <th class="px-4 py-2.5 font-medium">Total</th>
              <th class="px-4 py-2.5 font-medium">Status</th>
              <th class="px-4 py-2.5 font-medium">Created</th>
              <th class="px-4 py-2.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-(--a-border)">
            <tr
              v-for="order in items"
              :key="order._id"
              class="cursor-pointer transition-colors hover:bg-(--a-hover)"
              @click="openDetail(order)"
            >
              <td class="px-4 py-2.5 font-medium text-(--a-text)">#{{ order.orderNumber }}</td>
              <td class="px-4 py-2.5 text-(--a-muted)">{{ userName(order) }}</td>
              <td class="max-w-[220px] px-4 py-2.5">
                <p class="truncate text-(--a-muted)">{{ serviceName(order) }}</p>
                <p v-if="order.link" class="truncate text-xs text-(--a-muted-3)">{{ order.link }}</p>
              </td>
              <td class="px-4 py-2.5 text-(--a-muted)">{{ formatNumber(order.quantity) }}</td>
              <td class="px-4 py-2.5 font-semibold text-(--a-text)">{{ formatMoney(order.totalPrice) }}</td>
              <td class="px-4 py-2.5" @click.stop>
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
              <td class="px-4 py-2.5 text-(--a-muted-2)">{{ formatDate(order.createdAt) }}</td>
              <td class="px-4 py-2.5" @click.stop>
                <div class="flex items-center justify-end">
                  <button
                    class="flex h-8 w-8 items-center justify-center rounded-lg text-(--a-muted) transition-colors hover:bg-brand-500/15 hover:text-brand-400"
                    :title="`Order again #${order.orderNumber}`"
                    aria-label="Order again"
                    @click="askOrderAgain(order)"
                  >
                    <Repeat class="h-4 w-4" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Order detail / re-order modal (support-agent "Order again") -->
    <BaseModal
      :open="detailOrder !== null"
      :title="confirmStep ? 'Re-order for this customer?' : `Order #${detailOrder?.orderNumber ?? ''}`"
      max-width="max-w-lg"
      @close="closeDetail"
    >
      <div v-if="detailOrder" class="space-y-4">
        <!-- Step 1 — full order details -->
        <template v-if="!confirmStep">
          <div class="grid grid-cols-2 gap-3">
            <div class="rounded-xl border border-(--a-border) bg-(--a-soft) px-3.5 py-3">
              <p class="text-[11px] uppercase tracking-wider text-(--a-muted-2)">Customer</p>
              <p class="mt-0.5 truncate text-sm font-medium text-(--a-text)">{{ userName(detailOrder) }}</p>
            </div>
            <div class="rounded-xl border border-(--a-border) bg-(--a-soft) px-3.5 py-3">
              <p class="text-[11px] uppercase tracking-wider text-(--a-muted-2)">Status</p>
              <p class="mt-0.5">
                <BaseBadge :tone="STATUS_TONE[detailOrder.status] ?? 'neutral'" dot>
                  {{ STATUS_LABEL[detailOrder.status] ?? detailOrder.status }}
                </BaseBadge>
              </p>
            </div>
            <div class="col-span-2 rounded-xl border border-(--a-border) bg-(--a-soft) px-3.5 py-3">
              <p class="text-[11px] uppercase tracking-wider text-(--a-muted-2)">Service</p>
              <p class="mt-0.5 text-sm font-medium text-(--a-text)">{{ serviceName(detailOrder) }}</p>
            </div>
            <div class="col-span-2 rounded-xl border border-(--a-border) bg-(--a-soft) px-3.5 py-3">
              <p class="text-[11px] uppercase tracking-wider text-(--a-muted-2)">Link</p>
              <p class="mt-0.5 break-all text-sm text-(--a-text-soft)">{{ detailOrder.link || '—' }}</p>
            </div>
            <div class="rounded-xl border border-(--a-border) bg-(--a-soft) px-3.5 py-3">
              <p class="text-[11px] uppercase tracking-wider text-(--a-muted-2)">Quantity</p>
              <p class="mt-0.5 text-sm font-semibold text-(--a-text)">{{ formatNumber(detailOrder.quantity) }}</p>
            </div>
            <div class="rounded-xl border border-(--a-border) bg-(--a-soft) px-3.5 py-3">
              <p class="text-[11px] uppercase tracking-wider text-(--a-muted-2)">Total</p>
              <p class="mt-0.5 text-sm font-semibold text-(--a-text)">{{ formatMoney(detailOrder.totalPrice) }}</p>
            </div>
            <div v-if="detailOrder.params && Object.keys(detailOrder.params).length" class="col-span-2 rounded-xl border border-(--a-border) bg-(--a-soft) px-3.5 py-3">
              <p class="text-[11px] uppercase tracking-wider text-(--a-muted-2)">Options</p>
              <p class="mt-0.5 max-h-20 overflow-y-auto text-sm text-(--a-text-soft)">{{ paramsSummary || '—' }}</p>
            </div>
          </div>
          <p class="text-xs text-(--a-muted-2)">
            Placed {{ formatDate(detailOrder.createdAt) }} ·
            Provider #{{ detailOrder.providerOrderId ?? '—' }}
          </p>
          <BaseButton block @click="confirmStep = true">
            <Repeat class="h-4 w-4" /> Order again
          </BaseButton>
        </template>

        <!-- Step 2 — re-order confirmation -->
        <template v-else>
          <div class="space-y-3">
            <p class="text-sm leading-relaxed text-(--a-text-soft)">
              Re-place this order for <b class="text-(--a-text)">{{ userName(detailOrder) }}</b> with the
              same service, link and options. The customer's wallet is charged
              <b class="text-(--a-text)">{{ formatMoney(detailOrder.totalPrice) }}</b>
              — the same as if they ordered it themselves.
            </p>
            <div class="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-300">
              If the customer's balance is not enough, the order is <b>not</b> placed and you'll see the
              shortfall — top up their wallet first.
            </div>
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <BaseButton variant="ghost" :disabled="reordering" @click="confirmStep = false">
              Back
            </BaseButton>
            <BaseButton :loading="reordering" @click="confirmOrderAgain">
              <Repeat class="h-4 w-4" />
              Confirm — charge {{ formatMoney(detailOrder.totalPrice) }}
            </BaseButton>
          </div>
        </template>
      </div>
    </BaseModal>

    <div v-if="Math.ceil(total / pageSize) > 1" class="flex items-center justify-center gap-3 pt-2">
      <button class="rounded-xl border border-(--a-border) px-4 py-2 text-sm text-(--a-text-soft) hover:border-brand-400/50 disabled:opacity-30" :disabled="page <= 1" @click="page--; void load()">Prev</button>
      <span class="text-sm text-(--a-muted)">Page {{ page }} / {{ Math.ceil(total / pageSize) }}</span>
      <button class="rounded-xl border border-(--a-border) px-4 py-2 text-sm text-(--a-text-soft) hover:border-brand-400/50 disabled:opacity-30" :disabled="page >= Math.ceil(total / pageSize)" @click="page++; void load()">Next</button>
    </div>
  </div>
</template>
