<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft,
  CalendarClock,
  CreditCard,
  Mail,
  Receipt,
  ShoppingBag,
  User,
  Wallet,
} from '@lucide/vue'
import { adminApi } from '@/api/admin.api'
import { useToast } from '@/composables/useToast'
import { errorMessage, formatDate, formatMoney, formatNumber, formatRelative } from '@/utils/format'
import type { Order, Payment, UserDetail } from '@/types/models'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import BaseSkeleton from '@/components/ui/BaseSkeleton.vue'
import BaseEmptyState from '@/components/ui/BaseEmptyState.vue'

type Tab = 'orders' | 'payments'

const route = useRoute()
const router = useRouter()
const toast = useToast()

const userId = route.params.id as string
const tab = ref<Tab>('orders')
const detail = ref<UserDetail | null>(null)
const loading = ref(true)
const orders = ref<Order[]>([])
const payments = ref<Payment[]>([])
const ordersTotal = ref(0)
const paymentsTotal = ref(0)
const page = ref(1)
const pageSize = 10
const loadOrders = ref(false)
const loadPayments = ref(false)

const user = computed<UserDetail['user'] | null>(() => detail.value?.user ?? null)

function resolveService(order: Order): string {
  const s = order.service
  if (!s) return '—'
  return typeof s === 'string' ? s : (s.name ?? s._id)
}

function resolveOrderRef(payment: Payment): string {
  const o = payment.order
  if (!o) return '—'
  if (typeof o === 'string') return o
  return o.orderNumber ? `#${o.orderNumber}` : (o.service && typeof o.service === 'object' && o.service.name ? o.service.name : o._id)
}

async function loadDetail(): Promise<void> {
  loading.value = true
  try {
    detail.value = await adminApi.getUserDetail(userId)
  } catch (err) {
    toast.error(errorMessage(err, 'Failed to load user details'))
  } finally {
    loading.value = false
  }
}

async function loadTab(): Promise<void> {
  try {
    if (tab.value === 'orders') {
      loadOrders.value = true
      const result = await adminApi.getUserOrders(userId, { page: page.value, limit: pageSize })
      orders.value = result.items
      ordersTotal.value = result.total
    } else {
      loadPayments.value = true
      const result = await adminApi.getUserPayments(userId, { page: page.value, limit: pageSize })
      payments.value = result.items
      paymentsTotal.value = result.total
    }
  } catch (err) {
    toast.error(errorMessage(err, 'Failed to load user activity'))
  } finally {
    loadOrders.value = false
    loadPayments.value = false
  }
}

function switchTab(next: Tab): void {
  if (next === tab.value) return
  tab.value = next
  page.value = 1
  void loadTab()
}

function changePage(delta: number): void {
  const next = page.value + delta
  const max = Math.ceil((tab.value === 'orders' ? ordersTotal.value : paymentsTotal.value) / pageSize)
  if (next < 1 || next > max) return
  page.value = next
  void loadTab()
}

onMounted(() => {
  void loadDetail()
  void loadTab()
})
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-5">
    <!-- Back -->
    <button
      class="flex items-center gap-2 text-sm font-medium text-(--a-muted) transition-colors hover:text-brand-300"
      @click="router.push('/users')"
    >
      <ArrowLeft class="h-4 w-4" /> Back to users
    </button>

    <!-- Header card -->
    <div v-if="loading" class="space-y-3">
      <BaseSkeleton class="h-40 w-full" />
      <BaseSkeleton class="h-24 w-full" />
    </div>

    <template v-else-if="user">
      <div class="glass relative overflow-hidden rounded-2xl p-6 shadow-card sm:p-8">
        <div class="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-gradient-to-br from-brand-500/20 to-secondary-500/10 blur-3xl" />
        <div class="relative flex flex-col gap-6 sm:flex-row sm:items-center">
          <div class="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-secondary-500 text-2xl font-bold text-white shadow-glow">
            {{ (user.name || user.email).slice(0, 2).toUpperCase() }}
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <h1 class="font-display text-2xl font-bold text-(--a-text)">{{ user.name || 'Unnamed user' }}</h1>
              <BaseBadge tone="brand">{{ user.role === 'super_admin' ? 'super admin' : user.role }}</BaseBadge>
              <BaseBadge :tone="user.isActive ? 'success' : 'danger'" dot>
                {{ user.isActive ? 'Active' : 'Disabled' }}
              </BaseBadge>
            </div>
            <p class="mt-1 flex items-center gap-1.5 text-sm text-(--a-muted)">
              <Mail class="h-3.5 w-3.5" /> {{ user.email }}
            </p>
            <div class="mt-3 flex flex-wrap gap-4 text-xs text-(--a-muted-2)">
              <span class="flex items-center gap-1.5">
                <User class="h-3.5 w-3.5" /> Clerk ID: <code class="rounded bg-(--a-soft) px-1.5 py-0.5">{{ user.clerkId }}</code>
              </span>
              <span class="flex items-center gap-1.5"><CalendarClock class="h-3.5 w-3.5" /> Joined {{ formatDate(user.createdAt) }}</span>
              <span class="flex items-center gap-1.5"><CalendarClock class="h-3.5 w-3.5" /> Last login {{ formatRelative(user.lastLoginAt) }}</span>
            </div>
          </div>
        </div>

        <!-- Wallet summary -->
        <div v-if="user.wallet" class="relative mt-6 grid gap-3 sm:grid-cols-3">
          <div class="rounded-xl border border-(--a-border) bg-(--a-soft) p-4">
            <p class="text-xs font-medium uppercase tracking-wide text-(--a-muted-2)">Wallet balance</p>
            <p class="mt-1 font-display text-xl font-bold text-(--a-text)">
              {{ formatMoney(user.wallet.balance) }}
            </p>
          </div>
          <div class="rounded-xl border border-(--a-border) bg-(--a-soft) p-4">
            <p class="text-xs font-medium uppercase tracking-wide text-(--a-muted-2)">Total top-ups</p>
            <p class="mt-1 font-display text-xl font-bold text-(--a-text)">
              {{ formatMoney(user.wallet.totalTopUp) }}
            </p>
          </div>
          <div class="rounded-xl border border-(--a-border) bg-(--a-soft) p-4">
            <p class="text-xs font-medium uppercase tracking-wide text-(--a-muted-2)">Total spent</p>
            <p class="mt-1 font-display text-xl font-bold text-(--a-text)">
              {{ formatMoney(user.wallet.totalSpent) }}
            </p>
          </div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="flex items-center gap-1 rounded-2xl border border-(--a-border) bg-(--a-soft) p-1">
        <button
          class="flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all"
          :class="tab === 'orders' ? 'bg-(--a-surface) text-brand-300 shadow-card' : 'text-(--a-muted) hover:text-(--a-text)'"
          @click="switchTab('orders')"
        >
          <ShoppingBag class="h-4 w-4" /> Orders
          <span class="rounded-full bg-(--a-soft) px-2 py-0.5 text-xs">{{ ordersTotal }}</span>
        </button>
        <button
          class="flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all"
          :class="tab === 'payments' ? 'bg-(--a-surface) text-brand-300 shadow-card' : 'text-(--a-muted) hover:text-(--a-text)'"
          @click="switchTab('payments')"
        >
          <CreditCard class="h-4 w-4" /> Payments
          <span class="rounded-full bg-(--a-soft) px-2 py-0.5 text-xs">{{ paymentsTotal }}</span>
        </button>
      </div>

      <!-- Orders tab -->
      <div v-if="tab === 'orders'">
        <div v-if="loadOrders" class="space-y-3">
          <BaseSkeleton v-for="n in 5" :key="n" class="h-14 w-full" />
        </div>
        <BaseEmptyState v-else-if="orders.length === 0" title="No orders yet" message="This user has not placed any orders.">
          <ShoppingBag class="h-7 w-7 text-(--a-muted-2)" />
        </BaseEmptyState>
        <div v-else class="glass overflow-hidden rounded-2xl shadow-card">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead class="border-b border-(--a-border) text-xs uppercase tracking-wider text-(--a-muted-2)">
                <tr>
                  <th class="px-5 py-3 font-medium">Order</th>
                  <th class="px-5 py-3 font-medium">Service</th>
                  <th class="px-5 py-3 text-right font-medium">Qty</th>
                  <th class="px-5 py-3 text-right font-medium">Amount</th>
                  <th class="px-5 py-3 font-medium">Status</th>
                  <th class="px-5 py-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-(--a-border)">
                <tr v-for="order in orders" :key="order._id" class="transition-colors hover:bg-(--a-hover)">
                  <td class="px-5 py-3.5 font-medium text-(--a-text)">#{{ order.orderNumber }}</td>
                  <td class="max-w-[220px] truncate px-5 py-3.5 text-(--a-muted)">{{ resolveService(order) }}</td>
                  <td class="px-5 py-3.5 text-right text-(--a-text-soft)">{{ formatNumber(order.quantity) }}</td>
                  <td class="px-5 py-3.5 text-right font-semibold text-(--a-text)">{{ formatMoney(order.totalPrice) }}</td>
                  <td class="px-5 py-3.5">
                    <BaseBadge :tone="order.status === 'Completed' ? 'success' : order.status === 'Processing' || order.status === 'In progress' ? 'info' : order.status === 'Paid' ? 'brand' : order.status === 'Cancelled' || order.status === 'Failed' ? 'danger' : 'warning'">
                      {{ order.status }}
                    </BaseBadge>
                  </td>
                  <td class="px-5 py-3.5 text-(--a-muted-2)">{{ formatDate(order.createdAt) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Payments tab -->
      <div v-else>
        <div v-if="loadPayments" class="space-y-3">
          <BaseSkeleton v-for="n in 5" :key="n" class="h-14 w-full" />
        </div>
        <BaseEmptyState v-else-if="payments.length === 0" title="No payments yet" message="This user has not made any payments.">
          <Receipt class="h-7 w-7 text-(--a-muted-2)" />
        </BaseEmptyState>
        <div v-else class="glass overflow-hidden rounded-2xl shadow-card">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead class="border-b border-(--a-border) text-xs uppercase tracking-wider text-(--a-muted-2)">
                <tr>
                  <th class="px-5 py-3 font-medium">Reference</th>
                  <th class="px-5 py-3 font-medium">Order</th>
                  <th class="px-5 py-3 font-medium">Provider</th>
                  <th class="px-5 py-3 text-right font-medium">Amount</th>
                  <th class="px-5 py-3 font-medium">Status</th>
                  <th class="px-5 py-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-(--a-border)">
                <tr v-for="payment in payments" :key="payment._id" class="transition-colors hover:bg-(--a-hover)">
                  <td class="px-5 py-3.5">
                    <code class="rounded bg-(--a-soft) px-1.5 py-0.5 text-xs text-(--a-text-soft)">{{ payment.referenceId }}</code>
                  </td>
                  <td class="px-5 py-3.5 text-(--a-muted)">{{ resolveOrderRef(payment) }}</td>
                  <td class="px-5 py-3.5 capitalize text-(--a-muted-2)">{{ payment.provider }}</td>
                  <td class="px-5 py-3.5 text-right font-semibold text-(--a-text)">{{ formatMoney(payment.amount) }}</td>
                  <td class="px-5 py-3.5">
                    <BaseBadge :tone="payment.status === 'paid' ? 'success' : payment.status === 'pending' || payment.status === 'scanned' ? 'warning' : payment.status === 'expired' ? 'neutral' : 'danger'">
                      {{ payment.status }}
                    </BaseBadge>
                  </td>
                  <td class="px-5 py-3.5 text-(--a-muted-2)">{{ formatDate(payment.createdAt) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="Math.ceil((tab === 'orders' ? ordersTotal : paymentsTotal) / pageSize) > 1" class="flex items-center justify-center gap-3 pt-2">
        <button class="rounded-xl border border-(--a-border) px-4 py-2 text-sm text-(--a-text-soft) hover:border-brand-400/50 disabled:opacity-30" :disabled="page <= 1" @click="changePage(-1)">Prev</button>
        <span class="text-sm text-(--a-muted)">Page {{ page }} / {{ Math.ceil((tab === 'orders' ? ordersTotal : paymentsTotal) / pageSize) }}</span>
        <button class="rounded-xl border border-(--a-border) px-4 py-2 text-sm text-(--a-text-soft) hover:border-brand-400/50 disabled:opacity-30" :disabled="page >= Math.ceil((tab === 'orders' ? ordersTotal : paymentsTotal) / pageSize)" @click="changePage(1)">Next</button>
      </div>
    </template>

    <BaseEmptyState v-else title="User not found" message="The user may have been removed.">
      <Wallet class="h-7 w-7 text-(--a-muted-2)" />
    </BaseEmptyState>
  </div>
</template>
