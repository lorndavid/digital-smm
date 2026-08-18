<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  ArrowRight,
  Banknote,
  Boxes,
  DollarSign,
  Package,
  RefreshCcw,
  Users,
  Wallet,
} from '@lucide/vue'
import { ALL_INTEGRATION_PROVIDERS } from '@/utils/integrations'
import type { IntegrationSummary } from '@/types/models'
import { adminApi } from '@/api/admin.api'
import { useToast } from '@/composables/useToast'
import { formatCompact, formatMoney, formatNumber } from '@/utils/format'
import { STATUS_LABEL, STATUS_TONE } from '@/utils/constants'
import type { DashboardStats } from '@/types/models'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import BaseSkeleton from '@/components/ui/BaseSkeleton.vue'

const toast = useToast()
const router = useRouter()
const stats = ref<DashboardStats | null>(null)
const integrations = ref<IntegrationSummary[]>([])
const loading = ref(true)
const syncing = ref(false)
const error = ref('')

function integrationStatus(key: string): IntegrationSummary | undefined {
  return integrations.value.find((i) => i.provider === key)
}

function statusDot(key: string): { dot: string; label: string } {
  const s = integrationStatus(key)
  if (s?.status === 'CONNECTED') return { dot: 'bg-emerald-400', label: 'Connected' }
  if (s?.status === 'DISABLED') return { dot: 'bg-amber-400', label: 'Disabled' }
  if (s?.status === 'CONNECTION_FAILED') return { dot: 'bg-rose-400', label: 'Needs attention' }
  return { dot: 'bg-(--a-muted-3)', label: 'Not configured' }
}

const revenue = computed(() => stats.value?.orders.revenue ?? 0)
const paidRevenue = computed(
  () => stats.value?.paymentTotals.order?.total ?? 0,
)

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const [statsData, integrationData] = await Promise.all([
      adminApi.stats(),
      adminApi.listIntegrations().catch(() => [] as IntegrationSummary[]),
    ])
    stats.value = statsData
    integrations.value = integrationData
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
  <div class="w-full space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="font-display text-xl font-bold text-(--a-text)">Dashboard</h1>
        <p class="mt-0.5 text-sm text-(--a-muted)">Platform overview and key metrics.</p>
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
        <div class="glass rounded-xl p-4 shadow-card">
          <div class="flex items-center justify-between">
            <p class="text-[13px] text-(--a-muted)">Users</p>
            <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/20 text-brand-300"><Users class="h-4 w-4" /></div>
          </div>
          <p class="font-display mt-1.5 text-xl font-bold text-(--a-text)">{{ formatNumber(stats.users.total) }}</p>
          <p class="mt-0.5 text-xs text-emerald-300">{{ formatNumber(stats.users.active) }} active</p>
        </div>

        <div class="glass rounded-xl p-4 shadow-card">
          <div class="flex items-center justify-between">
            <p class="text-[13px] text-(--a-muted)">Orders</p>
            <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/20 text-sky-300"><Package class="h-4 w-4" /></div>
          </div>
          <p class="font-display mt-1.5 text-xl font-bold text-(--a-text)">{{ formatNumber(stats.orders.total) }}</p>
          <p class="mt-0.5 text-xs text-(--a-muted-2)">lifetime orders</p>
        </div>

        <div class="glass rounded-xl p-4 shadow-card">
          <div class="flex items-center justify-between">
            <p class="text-[13px] text-(--a-muted)">Revenue</p>
            <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-300"><DollarSign class="h-4 w-4" /></div>
          </div>
          <p class="font-display mt-1.5 text-xl font-bold text-(--a-text)">{{ formatMoney(revenue) }}</p>
          <p class="mt-0.5 text-xs text-(--a-muted-2)">{{ formatMoney(paidRevenue) }} paid via KHQR</p>
        </div>

        <div class="glass rounded-xl p-4 shadow-card">
          <div class="flex items-center justify-between">
            <p class="text-[13px] text-(--a-muted)">Catalog</p>
            <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20 text-amber-300"><Boxes class="h-4 w-4" /></div>
          </div>
          <p class="font-display mt-1.5 text-xl font-bold text-(--a-text)">{{ formatNumber(stats.services.total) }}</p>
          <p class="mt-0.5 text-xs text-(--a-muted-2)">{{ formatNumber(stats.services.active) }} active · {{ stats.categories }} categories</p>
        </div>
      </div>

      <!-- Integration health -->
      <div class="glass rounded-xl p-5 shadow-card">
        <div class="flex items-center justify-between">
          <h2 class="font-display text-sm font-semibold text-(--a-text)">Integration Health</h2>
          <button
            class="inline-flex items-center gap-1 text-xs font-medium text-brand-300 transition-colors hover:text-brand-200"
            @click="router.push('/integrations')"
          >
            Manage <ArrowRight class="h-3.5 w-3.5" />
          </button>
        </div>
        <div class="mt-3 grid gap-3 sm:grid-cols-3">
          <button
            v-for="meta in ALL_INTEGRATION_PROVIDERS"
            :key="meta.key"
            class="flex items-center gap-3 rounded-lg border border-(--a-border) p-3 text-left transition-colors hover:border-brand-400/40 hover:bg-(--a-soft)"
            @click="router.push(`/integrations/${meta.key}`)"
          >
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/15 text-brand-300">
              <component :is="meta.icon" class="h-4 w-4" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[13px] font-medium text-(--a-text)">{{ meta.name }}</span>
              <span class="flex items-center gap-1.5 text-xs" :class="statusDot(meta.key).label === 'Needs attention' ? 'text-rose-300' : 'text-(--a-muted-2)'">
                <span class="h-1.5 w-1.5 rounded-full" :class="statusDot(meta.key).dot" />
                {{ statusDot(meta.key).label }}
              </span>
            </span>
          </button>
        </div>
      </div>

      <div class="grid gap-5 lg:grid-cols-2">
        <!-- Status breakdown -->
        <div class="glass rounded-xl p-5 shadow-card">
          <h2 class="font-display text-sm font-semibold text-(--a-text)">Orders by status</h2>
          <div class="mt-3 space-y-2.5">
            <div
              v-for="row in stats.statusBreakdown"
              :key="row._id"
              class="flex items-center justify-between text-sm"
            >
              <BaseBadge :tone="STATUS_TONE[row._id as keyof typeof STATUS_TONE] ?? 'neutral'" dot>
                {{ STATUS_LABEL[row._id as keyof typeof STATUS_TONE] ?? row._id }}
              </BaseBadge>
              <span class="font-semibold text-(--a-text)">{{ formatNumber(row.count) }}</span>
            </div>
            <p v-if="stats.statusBreakdown.length === 0" class="text-sm text-(--a-muted-2)">No orders yet.</p>
          </div>
        </div>

        <!-- Financials -->
        <div class="glass rounded-xl p-5 shadow-card">
          <h2 class="font-display text-sm font-semibold text-(--a-text)">Financials</h2>
          <div class="mt-3 space-y-2.5 text-sm">
            <div class="flex items-center justify-between">
              <span class="flex items-center gap-2 text-(--a-muted)"><Banknote class="h-4 w-4 text-brand-300" /> Paid order payments</span>
              <span class="font-semibold text-(--a-text)">{{ formatMoney(stats.paymentTotals.order?.total ?? 0) }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="flex items-center gap-2 text-(--a-muted)"><Wallet class="h-4 w-4 text-secondary-400" /> Wallet top-ups</span>
              <span class="font-semibold text-(--a-text)">{{ formatMoney(stats.paymentTotals.topup?.total ?? 0) }}</span>
            </div>
            <div class="flex items-center justify-between border-t border-(--a-border) pt-3">
              <span class="text-(--a-muted)">Provider balance</span>
              <span class="font-semibold text-(--a-text)">
                {{ stats.providerBalance ? formatMoney(stats.providerBalance.balance, stats.providerBalance.currency) : '—' }}
              </span>
            </div>
            <p class="text-xs text-(--a-muted-3)">
              Paid orders: {{ formatCompact(stats.paymentTotals.order?.count ?? 0) }} · Top-ups: {{ formatCompact(stats.paymentTotals.topup?.count ?? 0) }}
            </p>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
