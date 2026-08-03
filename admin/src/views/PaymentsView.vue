<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Download, Search } from '@lucide/vue'
import { adminApi } from '@/api/admin.api'
import { useToast } from '@/composables/useToast'
import { errorMessage, formatDate, formatMoney } from '@/utils/format'
import { PAYMENT_TONE } from '@/utils/constants'
import type { Payment, PaymentStats } from '@/types/models'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseSkeleton from '@/components/ui/BaseSkeleton.vue'
import BaseEmptyState from '@/components/ui/BaseEmptyState.vue'

const toast = useToast()

const items = ref<Payment[]>([])
const total = ref(0)
const loading = ref(true)
const stats = ref<PaymentStats | null>(null)
const status = ref('')
const search = ref('')
const page = ref(1)
const pageSize = 15
const exporting = ref(false)

const filterOptions = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'scanned', label: 'Scanned' },
  { value: 'paid', label: 'Paid' },
  { value: 'expired', label: 'Expired' },
  { value: 'failed', label: 'Failed' },
  { value: 'refunded', label: 'Refunded' },
]

const statCards = computed(() => [
  { label: "Today's revenue", value: formatMoney(stats.value?.todayRevenue ?? 0), accent: 'text-emerald-300' },
  { label: 'Successful payments', value: String(stats.value?.counts.paid ?? 0), accent: 'text-emerald-300' },
  { label: 'Pending', value: String((stats.value?.counts.pending ?? 0) + (stats.value?.counts.scanned ?? 0)), accent: 'text-amber-300' },
  { label: 'Expired', value: String(stats.value?.counts.expired ?? 0), accent: 'text-(--a-muted)' },
  { label: 'Failed', value: String(stats.value?.counts.failed ?? 0), accent: 'text-rose-300' },
])

function userName(payment: Payment): string {
  return typeof payment.user === 'object' ? (payment.user.name || payment.user.email) : '—'
}

function orderInfo(payment: Payment): string {
  if (!payment.order || typeof payment.order !== 'object') return '—'
  const order = payment.order
  const num = order.orderNumber ? `#${order.orderNumber}` : ''
  const service = typeof order.service === 'object' && order.service ? (order.service.name ?? '') : ''
  return [num, service].filter(Boolean).join(' · ') || '—'
}

async function load(): Promise<void> {
  loading.value = true
  try {
    const result = await adminApi.listPayments({
      page: page.value,
      limit: pageSize,
      status: status.value || undefined,
      search: search.value.trim() || undefined,
    })
    items.value = result.items
    total.value = result.total
  } catch (err) {
    toast.error(errorMessage(err, 'Failed to load payments'))
  } finally {
    loading.value = false
  }
}

async function loadStats(): Promise<void> {
  try {
    stats.value = await adminApi.paymentStats()
  } catch {
    /* stats are decorative; table load is the critical path */
  }
}

async function exportCsv(): Promise<void> {
  exporting.value = true
  try {
    const blob = await adminApi.exportPayments({
      status: status.value || undefined,
      search: search.value.trim() || undefined,
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `payments-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Payments exported as CSV')
  } catch (err) {
    toast.error(errorMessage(err, 'Export failed'))
  } finally {
    exporting.value = false
  }
}

function applySearch(): void {
  page.value = 1
  void load()
}

onMounted(() => {
  void load()
  void loadStats()
})
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="font-display text-2xl font-bold text-(--a-text)">Payments</h1>
        <p class="mt-1 text-sm text-(--a-muted)">Every KHQR transaction. ({{ total }} payments)</p>
      </div>
      <BaseButton variant="outline" :loading="exporting" @click="exportCsv">
        <Download class="h-4 w-4" /> Export CSV
      </BaseButton>
    </div>

    <!-- Stats -->
    <div v-if="stats" class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <div v-for="card in statCards" :key="card.label" class="glass rounded-2xl p-4 shadow-card">
        <p class="text-xs text-(--a-muted-2)">{{ card.label }}</p>
        <p class="font-display mt-1 text-xl font-bold" :class="card.accent">{{ card.value }}</p>
      </div>
    </div>

    <!-- Filters -->
    <div class="flex flex-wrap items-center gap-3">
      <div class="relative min-w-[220px] flex-1 sm:max-w-xs">
        <Search class="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-(--a-muted-3)" />
        <input
          v-model="search"
          type="text"
          placeholder="Search reference…"
          class="h-11 w-full rounded-xl border border-(--a-border) bg-(--a-soft) pl-10 pr-4 text-sm text-(--a-text) placeholder:text-(--a-muted-3) focus:border-brand-400/60 focus:outline-none"
          @keyup.enter="applySearch"
        />
      </div>
      <select
        v-model="status"
        class="h-11 rounded-xl border border-(--a-border) bg-(--a-soft) px-4 text-sm text-(--a-text) focus:border-brand-400/60 focus:outline-none [&>option]:bg-(--a-option-bg)"
        @change="page = 1; void load()"
      >
        <option v-for="opt in filterOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
      </select>
      <BaseButton variant="ghost" size="sm" @click="applySearch">Apply</BaseButton>
    </div>

    <div v-if="loading" class="space-y-3">
      <BaseSkeleton v-for="n in 8" :key="n" class="h-16 w-full" />
    </div>

    <BaseEmptyState v-else-if="items.length === 0" title="No payments found" message="Adjust the filters or try a different reference." />

    <div v-else class="glass overflow-hidden rounded-2xl shadow-card">
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="border-b border-(--a-border) text-xs uppercase tracking-wider text-(--a-muted-2)">
            <tr>
              <th class="px-5 py-3 font-medium">Reference</th>
              <th class="px-5 py-3 font-medium">Customer</th>
              <th class="px-5 py-3 font-medium">Order</th>
              <th class="px-5 py-3 font-medium">Amount</th>
              <th class="px-5 py-3 font-medium">Provider</th>
              <th class="px-5 py-3 font-medium">Status</th>
              <th class="px-5 py-3 font-medium">Date</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-(--a-border)">
            <tr v-for="payment in items" :key="payment._id" class="transition-colors hover:bg-(--a-hover)">
              <td class="px-5 py-3.5 font-mono text-xs font-medium text-(--a-text)">{{ payment.referenceId }}</td>
              <td class="px-5 py-3.5 text-(--a-muted)">{{ userName(payment) }}</td>
              <td class="px-5 py-3.5 text-(--a-muted)">{{ orderInfo(payment) }}</td>
              <td class="px-5 py-3.5 font-semibold text-(--a-text)">{{ formatMoney(payment.amount) }}</td>
              <td class="px-5 py-3.5 text-(--a-muted)">{{ payment.provider }} · {{ payment.method }}</td>
              <td class="px-5 py-3.5">
                <BaseBadge :tone="PAYMENT_TONE[payment.status] ?? 'neutral'" dot>{{ payment.status }}</BaseBadge>
              </td>
              <td class="px-5 py-3.5 text-(--a-muted-2)">{{ formatDate(payment.approvedAt ?? payment.createdAt) }}</td>
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
