<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  CalendarRange,
  ChevronDown,
  FileDown,
  Loader2,
  QrCode,
  Receipt,
  Wallet,
} from '@lucide/vue'
import { paymentApi } from '@/api/payment.api'
import { ApiRequestError } from '@/api/client'
import { useAuthStore } from '@/stores/auth.store'
import { useToast } from '@/composables/useToast'
import { formatDate, formatMoney, formatNumber } from '@/utils/format'
import {
  downloadPaymentReport,
  isInRange,
  reportRangeBounds,
  REPORT_RANGE_LABEL,
  REPORT_RANGE_OPTIONS,
  type ReportPayment,
  type ReportRange,
} from '@/utils/paymentReport'
import { PAYMENT_PURPOSE_LABEL, PAYMENT_STATUS_META } from '@/utils/constants'
import type { Order, Payment } from '@/types/models'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import BaseSkeleton from '@/components/ui/BaseSkeleton.vue'
import BaseEmptyState from '@/components/ui/BaseEmptyState.vue'

const authStore = useAuthStore()
const toast = useToast()

const items = ref<Payment[]>([])
const loading = ref(true)
const range = ref<ReportRange>('all')
const exportOpen = ref(false)
const exporting = ref(false)
const receipt = ref<Payment | null>(null)

const rangeChips: Array<{ value: ReportRange; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
]

/** Loads the FULL payment history (paginated) so summaries are exact. */
async function loadAll(): Promise<Payment[]> {
  const all: Payment[] = []
  let page = 1
  const pageSize = 100
  for (;;) {
    const result = await paymentApi.history({ page, limit: pageSize })
    all.push(...result.items)
    if (all.length >= result.total || result.items.length === 0) break
    page += 1
  }
  return all
}

async function load(): Promise<void> {
  loading.value = true
  try {
    items.value = await loadAll()
  } catch {
    /* toast handled by store-level error surface */
  } finally {
    loading.value = false
  }
}

const filtered = computed(() => {
  const bounds = reportRangeBounds(range.value)
  return items.value
    .filter((p) => isInRange(p.approvedAt ?? p.createdAt, bounds))
    .sort((a, b) => new Date(b.approvedAt ?? b.createdAt).getTime() - new Date(a.approvedAt ?? a.createdAt).getTime())
})

/** Summary over the currently filtered payments (amounts: settled only). */
const summary = computed(() => {
  let topup = 0
  let spend = 0
  let settledTopups = 0
  for (const p of filtered.value) {
    if (p.status !== 'paid') continue
    if (p.purpose === 'topup') {
      topup += p.amount
      settledTopups += 1
    } else {
      spend += p.amount
    }
  }
  return {
    topup,
    spend,
    total: topup + spend,
    settledTopups,
    count: filtered.value.length,
  }
})

function serviceName(payment: Payment): string {
  const order = payment.order
  if (order && typeof order === 'object' && typeof order.service === 'object') {
    return order.service.name
  }
  return ''
}

function orderNumber(payment: Payment): number | null {
  const order = payment.order
  return order && typeof order === 'object' ? order.orderNumber : null
}

function toReportPayment(payment: Payment): ReportPayment {
  return {
    date: payment.approvedAt ?? payment.createdAt,
    referenceId: payment.referenceId,
    purpose: payment.purpose,
    description:
      payment.purpose === 'topup' ? 'Wallet top-up' : serviceName(payment) || 'Service order',
    method: payment.method,
    status: payment.status,
    amount: payment.amount,
  }
}

async function exportPdf(exportRange: ReportRange): Promise<void> {
  exportOpen.value = false
  if (exporting.value) return
  exporting.value = true
  try {
    // Fresh full fetch — the report covers every payment in the range,
    // regardless of the currently visible filter.
    const all = await loadAll()
    const bounds = reportRangeBounds(exportRange)
    const payments = all
      .filter((p) => isInRange(p.approvedAt ?? p.createdAt, bounds))
      .map(toReportPayment)
      .sort(
        (a, b) =>
          new Date(b.date).getTime() - new Date(a.date).getTime(),
      )
    const user = authStore.user
    downloadPaymentReport({
      range: exportRange,
      account: { name: user?.name ?? '', email: user?.email ?? '' },
      payments,
    })
    toast.success(`${REPORT_RANGE_LABEL[exportRange]} payment report downloaded`)
  } catch (err) {
    const message = err instanceof ApiRequestError ? err.message : 'Failed to export the report'
    toast.error(message)
  } finally {
    exporting.value = false
  }
}

onMounted(() => void load())
</script>

<template>
  <div class="w-full space-y-5">
    <!-- Header -->
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="font-display text-xl font-bold text-ink">Payments</h1>
        <p class="mt-0.5 text-sm text-ink/50">
          Every KHQR transaction — top-ups and service orders. ({{ items.length }})
        </p>
      </div>

      <!-- Export PDF dropdown -->
      <div class="relative">
        <button
          type="button"
          class="flex h-9.5 items-center gap-2 rounded-lg bg-gradient-to-br from-brand-500 to-secondary-500 px-3.5 text-[13px] font-semibold text-white shadow-glow transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
          :disabled="exporting"
          @click="exportOpen = !exportOpen"
        >
          <FileDown v-if="!exporting" class="h-4 w-4" />
          <Loader2 v-else class="h-4 w-4 animate-spin" />
          Export PDF
          <ChevronDown
            class="h-4 w-4 transition-transform"
            :class="exportOpen ? 'rotate-180' : ''"
          />
        </button>

        <!-- Click-away overlay -->
        <div v-if="exportOpen" class="fixed inset-0 z-40" @click="exportOpen = false" />

        <Transition name="fade">
          <div
            v-if="exportOpen"
            class="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-ink/10 bg-card/95 p-1.5 shadow-glow backdrop-blur-xl"
          >
            <p class="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-ink/40">
              Report period
            </p>
            <button
              v-for="opt in REPORT_RANGE_OPTIONS"
              :key="opt.value"
              type="button"
              :aria-label="`Export ${opt.label}`"
              class="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-ink transition-colors hover:bg-ink/5"
              @click="exportPdf(opt.value)"
            >
              <CalendarRange class="h-4 w-4 text-brand-300" />
              <span class="flex-1">{{ opt.label }}</span>
              <span class="text-[10px] text-ink/30">PDF</span>
            </button>
            <p class="border-t border-ink/5 px-3 pb-1 pt-2 text-[11px] text-ink/35">
              Statement PDF with header, details and totals.
            </p>
          </div>
        </Transition>
      </div>
    </div>

    <!-- Range filter -->
    <div class="flex flex-wrap items-center gap-2">
      <button
        v-for="chip in rangeChips"
        :key="chip.value"
        type="button"
        class="rounded-full px-3.5 py-1 text-[13px] font-medium transition-all"
        :class="
          range === chip.value
            ? 'bg-brand-500/15 text-brand-200 ring-1 ring-brand-400/40'
            : 'bg-ink/5 text-ink/50 hover:bg-ink/10 hover:text-ink'
        "
        @click="range = chip.value"
      >
        {{ chip.label }}
      </button>
    </div>

    <!-- Summary cards -->
    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div class="summary-card glass rounded-xl p-4 shadow-card">
        <div class="flex items-center gap-2 text-ink/45">
          <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-400/15 text-emerald-300">
            <Wallet class="h-3.5 w-3.5" />
          </span>
          <span class="text-[11px] font-medium uppercase tracking-wide">Top-ups</span>
        </div>
        <p class="mt-2 font-display text-xl font-bold text-ink">{{ formatMoney(summary.topup) }}</p>
        <p class="mt-1 text-xs text-ink/40">{{ formatNumber(summary.settledTopups) }} settled top-ups</p>
      </div>

      <div class="summary-card glass rounded-xl p-4 shadow-card">
        <div class="flex items-center gap-2 text-ink/45">
          <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500/15 text-brand-300">
            <QrCode class="h-3.5 w-3.5" />
          </span>
          <span class="text-[11px] font-medium uppercase tracking-wide">Service spend</span>
        </div>
        <p class="mt-2 font-display text-xl font-bold text-ink">{{ formatMoney(summary.spend) }}</p>
        <p class="mt-1 text-xs text-ink/40">Paid from wallet &amp; KHQR orders</p>
      </div>

      <div class="summary-card glass rounded-xl p-4 shadow-card">
        <div class="flex items-center gap-2 text-ink/45">
          <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500/25 to-secondary-500/25 text-brand-200">
            <Receipt class="h-3.5 w-3.5" />
          </span>
          <span class="text-[11px] font-medium uppercase tracking-wide">Total settled</span>
        </div>
        <p class="mt-2 font-display text-xl font-bold text-ink">{{ formatMoney(summary.total) }}</p>
        <p class="mt-1 text-xs text-ink/40">Top-ups + service spend</p>
      </div>

      <div class="summary-card glass rounded-xl p-4 shadow-card">
        <div class="flex items-center gap-2 text-ink/45">
          <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-ink/10 text-ink/70">
            <CalendarRange class="h-3.5 w-3.5" />
          </span>
          <span class="text-[11px] font-medium uppercase tracking-wide">Transactions</span>
        </div>
        <p class="mt-2 font-display text-xl font-bold text-ink">{{ formatNumber(summary.count) }}</p>
        <p class="mt-1 text-xs text-ink/40">in the selected period</p>
      </div>
    </div>

    <!-- Timeline -->
    <div v-if="loading" class="space-y-4">
      <BaseSkeleton v-for="n in 5" :key="n" class="h-20 w-full" />
    </div>

    <BaseEmptyState
      v-else-if="filtered.length === 0"
      title="No payments in this period"
      message="Your KHQR payments will show up here once you top up or buy."
    />

    <div v-else class="relative ml-2 space-y-0">
      <div class="absolute bottom-4 left-[18px] top-4 w-px bg-gradient-to-b from-brand-400/50 via-ink/10 to-transparent" />

      <div
        v-for="payment in filtered"
        :key="payment._id"
        class="relative flex gap-4 pb-6 pl-1"
      >
        <!-- Node -->
        <div class="z-10 mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-ink/10 bg-card shadow-card">
          <Wallet
            v-if="payment.purpose === 'topup'"
            class="h-4 w-4 text-secondary-300"
          />
          <QrCode v-else class="h-4 w-4 text-brand-300" />
        </div>

        <!-- Card -->
        <div class="glass min-w-0 flex-1 rounded-xl p-4 shadow-card transition-all duration-300 hover:border-brand-400/30">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <p class="text-sm font-semibold text-ink">
                  {{ payment.purpose === 'topup' ? PAYMENT_PURPOSE_LABEL.topup : serviceName(payment) || 'Service order' }}
                </p>
                <BaseBadge :tone="PAYMENT_STATUS_META[payment.status]?.tone ?? 'neutral'" dot>
                  {{ PAYMENT_STATUS_META[payment.status]?.label ?? payment.status }}
                </BaseBadge>
              </div>
              <p class="mt-1 font-mono text-xs text-ink/40">{{ payment.referenceId }}</p>
              <p class="mt-0.5 text-xs text-ink/40">
                {{ formatDate(payment.approvedAt ?? payment.createdAt) }}
                <template v-if="orderNumber(payment)"> · Order #{{ orderNumber(payment) }}</template>
              </p>
            </div>

            <div class="flex shrink-0 items-center gap-4">
              <p class="text-sm font-bold text-ink">{{ formatMoney(payment.amount) }}</p>
              <button
                class="flex h-9 w-9 items-center justify-center rounded-xl border border-ink/10 bg-ink/5 text-ink/60 transition-all hover:border-brand-400/50 hover:text-ink"
                title="View receipt"
                @click="receipt = payment"
              >
                <Receipt class="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Receipt modal -->
    <BaseModal :open="!!receipt" title="Payment receipt" max-width="max-w-md" @close="receipt = null">
      <div v-if="receipt" class="space-y-4">
        <div class="flex items-center justify-between rounded-2xl bg-gradient-to-r from-brand-600/30 to-secondary-600/20 p-4">
          <div>
            <p class="text-xs text-ink/50">Amount paid</p>
            <p class="font-display text-3xl font-bold text-ink">{{ formatMoney(receipt.amount) }}</p>
          </div>
          <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink/10">
            <QrCode class="h-7 w-7 text-ink/80" />
          </div>
        </div>

        <dl class="space-y-2.5 text-sm">
          <div class="flex items-center justify-between">
            <dt class="text-ink/45">Reference</dt>
            <dd class="font-mono text-xs text-ink/80">{{ receipt.referenceId }}</dd>
          </div>
          <div class="flex items-center justify-between">
            <dt class="text-ink/45">Provider</dt>
            <dd class="capitalize text-ink/80">{{ receipt.provider }} · {{ receipt.method }}</dd>
          </div>
          <div class="flex items-center justify-between">
            <dt class="text-ink/45">Purpose</dt>
            <dd class="text-ink/80">{{ PAYMENT_PURPOSE_LABEL[receipt.purpose] ?? receipt.purpose }}</dd>
          </div>
          <template v-if="receipt.purpose === 'order' && typeof receipt.order === 'object'">
            <div class="flex items-center justify-between">
              <dt class="text-ink/45">Service</dt>
              <dd class="text-ink/80">{{ serviceName(receipt) }}</dd>
            </div>
            <div class="flex items-center justify-between">
              <dt class="text-ink/45">Quantity</dt>
              <dd class="text-ink/80">{{ formatNumber((receipt.order as Order).quantity) }}</dd>
            </div>
          </template>
          <div class="flex items-center justify-between">
            <dt class="text-ink/45">Paid at</dt>
            <dd class="text-ink/80">{{ formatDate(receipt.approvedAt ?? receipt.createdAt) }}</dd>
          </div>
        </dl>

        <div class="flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-4 py-3 text-xs text-emerald-300">
          <Receipt class="h-4 w-4 shrink-0" />
          This receipt confirms your payment was settled securely via Bakong KHQR.
        </div>
      </div>
    </BaseModal>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
