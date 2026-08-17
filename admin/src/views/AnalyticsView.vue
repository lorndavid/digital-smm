<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  Banknote,
  CircleDollarSign,
  Package,
  Percent,
  Receipt,
  TrendingUp,
  Users,
} from '@lucide/vue'
import { adminApi } from '@/api/admin.api'
import { formatMoney, formatNumber } from '@/utils/format'
import type {
  AnalyticsRange,
  OverviewAnalytics,
  RevenueAnalytics,
  ServicesAnalytics,
} from '@/types/models'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import BaseSkeleton from '@/components/ui/BaseSkeleton.vue'

const range = ref<AnalyticsRange>('30d')
const loading = ref(true)
const error = ref('')

const revenue = ref<RevenueAnalytics | null>(null)
const overview = ref<OverviewAnalytics | null>(null)
const services = ref<ServicesAnalytics | null>(null)

const RANGES: Array<{ value: AnalyticsRange; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
]

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const [rev, ov, svc] = await Promise.all([
      adminApi.analyticsRevenue(range.value),
      adminApi.analyticsOverview(range.value),
      adminApi.analyticsServices(range.value),
    ])
    revenue.value = rev
    overview.value = ov
    services.value = svc
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load analytics'
  } finally {
    loading.value = false
  }
}

const maxServiceCount = computed(() =>
  Math.max(1, ...(services.value?.topServices.map((s) => s.count) ?? [1])),
)
const maxPlatformRevenue = computed(() =>
  Math.max(1, ...(services.value?.byPlatform.map((p) => p.revenue) ?? [1])),
)

function platformLabel(key: string): string {
  const labels: Record<string, string> = {
    tiktok: 'TikTok',
    facebook: 'Facebook',
    instagram: 'Instagram',
    youtube: 'YouTube',
    telegram: 'Telegram',
    other: 'Other',
  }
  return labels[key] ?? key
}

function onRangeChange(): void {
  void load()
}

onMounted(() => void load())
</script>

<template>
  <div class="w-full space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="font-display text-xl font-bold text-(--a-text)">Analytics</h1>
        <p class="mt-0.5 text-sm text-(--a-muted)">
          Revenue, orders, users and services — computed from the database (source of truth).
        </p>
      </div>
      <div class="flex items-center gap-2">
        <BaseSelect :model-value="range" @update:model-value="range = $event as AnalyticsRange; onRangeChange()">
          <option v-for="r in RANGES" :key="r.value" :value="r.value">{{ r.label }}</option>
        </BaseSelect>
        <BaseButton :loading="loading" @click="load"><TrendingUp class="h-4 w-4" /> Refresh</BaseButton>
      </div>
    </div>

    <div v-if="loading" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <BaseSkeleton v-for="n in 4" :key="n" class="h-32 w-full" />
    </div>

    <p v-else-if="error" class="text-sm text-rose-300">{{ error }}</p>

    <template v-else-if="revenue && overview">
      <!-- KPI cards -->
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div class="glass rounded-xl p-4 shadow-card">
          <div class="flex items-center justify-between">
            <p class="text-[13px] text-(--a-muted)">Total revenue</p>
            <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-300"><Banknote class="h-4 w-4" /></div>
          </div>
          <p class="font-display mt-1.5 text-xl font-bold text-(--a-text)">{{ formatMoney(revenue.totalRevenue) }}</p>
        </div>
        <div class="glass rounded-xl p-4 shadow-card">
          <div class="flex items-center justify-between">
            <p class="text-[13px] text-(--a-muted)">Orders</p>
            <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/20 text-sky-300"><Package class="h-4 w-4" /></div>
          </div>
          <p class="font-display mt-1.5 text-xl font-bold text-(--a-text)">{{ formatNumber(overview.orders) }}</p>
          <p class="mt-0.5 text-xs text-emerald-300">{{ formatNumber(overview.paidOrders) }} paid</p>
        </div>
        <div class="glass rounded-xl p-4 shadow-card">
          <div class="flex items-center justify-between">
            <p class="text-[13px] text-(--a-muted)">New users</p>
            <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/20 text-brand-300"><Users class="h-4 w-4" /></div>
          </div>
          <p class="font-display mt-1.5 text-xl font-bold text-(--a-text)">{{ formatNumber(overview.users) }}</p>
        </div>
        <div class="glass rounded-xl p-4 shadow-card">
          <div class="flex items-center justify-between">
            <p class="text-[13px] text-(--a-muted)">Conversion</p>
            <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20 text-amber-300"><Percent class="h-4 w-4" /></div>
          </div>
          <p class="font-display mt-1.5 text-xl font-bold text-(--a-text)">{{ overview.conversionRate }}%</p>
        </div>
      </div>

      <!-- Payment KPIs -->
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div class="glass rounded-xl p-4 shadow-card">
          <p class="flex items-center gap-1.5 text-[13px] text-(--a-muted)"><Receipt class="h-3.5 w-3.5" /> Successful payments</p>
          <p class="font-display mt-1.5 text-xl font-bold text-(--a-text)">{{ formatNumber(revenue.successfulPayments) }}</p>
        </div>
        <div class="glass rounded-xl p-4 shadow-card">
          <p class="text-[13px] text-(--a-muted)">Failed payments</p>
          <p class="font-display mt-1.5 text-xl font-bold text-rose-300">{{ formatNumber(revenue.failedPayments) }}</p>
        </div>
        <div class="glass rounded-xl p-4 shadow-card">
          <p class="text-[13px] text-(--a-muted)">Refunds</p>
          <p class="font-display mt-1.5 text-xl font-bold text-(--a-text)">{{ formatNumber(revenue.refunds) }}</p>
        </div>
        <div class="glass rounded-xl p-4 shadow-card">
          <p class="flex items-center gap-1.5 text-[13px] text-(--a-muted)"><CircleDollarSign class="h-3.5 w-3.5" /> Avg order value</p>
          <p class="font-display mt-1.5 text-xl font-bold text-(--a-text)">{{ formatMoney(revenue.averageOrderValue) }}</p>
        </div>
      </div>

      <!-- Services analytics -->
      <div v-if="services" class="grid gap-5 lg:grid-cols-2">
        <div class="glass rounded-xl p-5 shadow-card">
          <h2 class="font-display text-sm font-semibold text-(--a-text)">Top services</h2>
          <div v-if="services.topServices.length === 0" class="mt-3 text-sm text-(--a-muted-2)">No orders in this range.</div>
          <div v-else class="mt-3 space-y-2.5">
            <div
              v-for="svc in services.topServices"
              :key="svc.serviceName"
              class="flex items-center justify-between gap-3 text-sm"
            >
              <div class="min-w-0 flex-1">
                <p class="truncate font-medium text-(--a-text)">{{ svc.serviceName }}</p>
                <div class="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-(--a-soft)">
                  <div class="h-full rounded-full bg-gradient-to-r from-brand-500 to-secondary-400" :style="{ width: `${(svc.count / maxServiceCount) * 100}%` }" />
                </div>
              </div>
              <div class="shrink-0 text-right">
                <p class="font-semibold text-(--a-text)">{{ formatNumber(svc.count) }} orders</p>
                <p class="text-xs text-(--a-muted-2)">{{ formatMoney(svc.revenue) }}</p>
              </div>
            </div>
          </div>
        </div>

        <div class="glass rounded-xl p-5 shadow-card">
          <h2 class="font-display text-sm font-semibold text-(--a-text)">Revenue by platform</h2>
          <div v-if="services.byPlatform.length === 0" class="mt-3 text-sm text-(--a-muted-2)">No orders in this range.</div>
          <div v-else class="mt-3 space-y-2.5">
            <div
              v-for="p in services.byPlatform"
              :key="p._id"
              class="flex items-center justify-between gap-3 text-sm"
            >
              <div class="min-w-0 flex-1">
                <p class="font-medium text-(--a-text)">{{ platformLabel(p._id) }}</p>
                <div class="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-(--a-soft)">
                  <div class="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400" :style="{ width: `${(p.revenue / maxPlatformRevenue) * 100}%` }" />
                </div>
              </div>
              <div class="shrink-0 text-right">
                <p class="font-semibold text-(--a-text)">{{ formatMoney(p.revenue) }}</p>
                <p class="text-xs text-(--a-muted-2)">{{ formatNumber(p.orders) }} orders</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
