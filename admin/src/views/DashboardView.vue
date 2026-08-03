<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  Banknote,
  Boxes,
  DollarSign,
  Package,
  RefreshCcw,
  Users,
  Wallet,
} from '@lucide/vue'
import { adminApi } from '@/api/admin.api'
import { useToast } from '@/composables/useToast'
import { formatCompact, formatMoney, formatNumber } from '@/utils/format'
import { STATUS_LABEL, STATUS_TONE } from '@/utils/constants'
import type { DashboardStats } from '@/types/models'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import BaseSkeleton from '@/components/ui/BaseSkeleton.vue'

const toast = useToast()
const stats = ref<DashboardStats | null>(null)
const loading = ref(true)
const syncing = ref(false)
const error = ref('')

const revenue = computed(() => stats.value?.orders.revenue ?? 0)
const paidRevenue = computed(
  () => stats.value?.paymentTotals.order?.total ?? 0,
)

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    stats.value = await adminApi.stats()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load stats'
  } finally {
    loading.value = false
  }
}

async function syncServices(): Promise<void> {
  syncing.value = true
  try {
    const result = await adminApi.syncServices()
    toast.success(`Synced: ${result.created} created, ${result.updated} updated`)
    await load()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Sync failed')
  } finally {
    syncing.value = false
  }
}

onMounted(() => void load())
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="font-display text-2xl font-bold text-white">Dashboard</h1>
        <p class="mt-1 text-sm text-white/50">Platform overview and key metrics.</p>
      </div>
      <BaseButton :loading="syncing" @click="syncServices">
        <RefreshCcw class="h-4 w-4" /> Sync services from provider
      </BaseButton>
    </div>

    <div v-if="loading" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <BaseSkeleton v-for="n in 4" :key="n" class="h-32 w-full" />
    </div>

    <p v-else-if="error" class="text-sm text-rose-300">{{ error }}</p>

    <template v-else-if="stats">
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div class="glass rounded-2xl p-5 shadow-card">
          <div class="flex items-center justify-between">
            <p class="text-sm text-white/50">Users</p>
            <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/20 text-brand-300"><Users class="h-5 w-5" /></div>
          </div>
          <p class="font-display mt-2 text-2xl font-bold text-white">{{ formatNumber(stats.users.total) }}</p>
          <p class="mt-1 text-xs text-emerald-300">{{ formatNumber(stats.users.active) }} active</p>
        </div>

        <div class="glass rounded-2xl p-5 shadow-card">
          <div class="flex items-center justify-between">
            <p class="text-sm text-white/50">Orders</p>
            <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/20 text-sky-300"><Package class="h-5 w-5" /></div>
          </div>
          <p class="font-display mt-2 text-2xl font-bold text-white">{{ formatNumber(stats.orders.total) }}</p>
          <p class="mt-1 text-xs text-white/40">lifetime orders</p>
        </div>

        <div class="glass rounded-2xl p-5 shadow-card">
          <div class="flex items-center justify-between">
            <p class="text-sm text-white/50">Revenue</p>
            <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300"><DollarSign class="h-5 w-5" /></div>
          </div>
          <p class="font-display mt-2 text-2xl font-bold text-white">{{ formatMoney(revenue) }}</p>
          <p class="mt-1 text-xs text-white/40">{{ formatMoney(paidRevenue) }} paid via KHQR</p>
        </div>

        <div class="glass rounded-2xl p-5 shadow-card">
          <div class="flex items-center justify-between">
            <p class="text-sm text-white/50">Catalog</p>
            <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-300"><Boxes class="h-5 w-5" /></div>
          </div>
          <p class="font-display mt-2 text-2xl font-bold text-white">{{ formatNumber(stats.services.total) }}</p>
          <p class="mt-1 text-xs text-white/40">{{ formatNumber(stats.services.active) }} active · {{ stats.categories }} categories</p>
        </div>
      </div>

      <div class="grid gap-6 lg:grid-cols-2">
        <!-- Status breakdown -->
        <div class="glass rounded-2xl p-6 shadow-card">
          <h2 class="font-display text-base font-semibold text-white">Orders by status</h2>
          <div class="mt-4 space-y-3">
            <div
              v-for="row in stats.statusBreakdown"
              :key="row._id"
              class="flex items-center justify-between text-sm"
            >
              <BaseBadge :tone="STATUS_TONE[row._id as keyof typeof STATUS_TONE] ?? 'neutral'" dot>
                {{ STATUS_LABEL[row._id as keyof typeof STATUS_TONE] ?? row._id }}
              </BaseBadge>
              <span class="font-semibold text-white">{{ formatNumber(row.count) }}</span>
            </div>
            <p v-if="stats.statusBreakdown.length === 0" class="text-sm text-white/40">No orders yet.</p>
          </div>
        </div>

        <!-- Financials -->
        <div class="glass rounded-2xl p-6 shadow-card">
          <h2 class="font-display text-base font-semibold text-white">Financials</h2>
          <div class="mt-4 space-y-3 text-sm">
            <div class="flex items-center justify-between">
              <span class="flex items-center gap-2 text-white/60"><Banknote class="h-4 w-4 text-brand-300" /> Paid order payments</span>
              <span class="font-semibold text-white">{{ formatMoney(stats.paymentTotals.order?.total ?? 0) }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="flex items-center gap-2 text-white/60"><Wallet class="h-4 w-4 text-secondary-400" /> Wallet top-ups</span>
              <span class="font-semibold text-white">{{ formatMoney(stats.paymentTotals.topup?.total ?? 0) }}</span>
            </div>
            <div class="flex items-center justify-between border-t border-white/10 pt-3">
              <span class="text-white/60">Provider balance</span>
              <span class="font-semibold text-white">
                {{ stats.providerBalance ? formatMoney(stats.providerBalance.balance, stats.providerBalance.currency) : '—' }}
              </span>
            </div>
            <p class="text-xs text-white/35">
              Paid orders: {{ formatCompact(stats.paymentTotals.order?.count ?? 0) }} · Top-ups: {{ formatCompact(stats.paymentTotals.topup?.count ?? 0) }}
            </p>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
