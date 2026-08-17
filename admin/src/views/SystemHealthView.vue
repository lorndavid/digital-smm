<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Gauge,
  Server,
  ShieldCheck,
  XCircle,
} from '@lucide/vue'
import { adminApi } from '@/api/admin.api'
import { formatNumber } from '@/utils/format'
import type { DependencyStatus, SystemHealth } from '@/types/models'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseSkeleton from '@/components/ui/BaseSkeleton.vue'

const health = ref<SystemHealth | null>(null)
const loading = ref(true)
const error = ref('')
let timer: ReturnType<typeof setInterval> | null = null

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    health.value = await adminApi.systemHealth()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load system health'
  } finally {
    loading.value = false
  }
}

const STATUS_META: Record<DependencyStatus, { label: string; tone: string; icon: typeof CheckCircle2 }> = {
  ok: { label: 'Healthy', tone: 'text-emerald-300 bg-emerald-400/10 ring-emerald-400/30', icon: CheckCircle2 },
  degraded: { label: 'Degraded', tone: 'text-amber-300 bg-amber-400/10 ring-amber-400/30', icon: AlertTriangle },
  down: { label: 'Offline', tone: 'text-rose-300 bg-rose-400/10 ring-rose-400/30', icon: XCircle },
  'not-configured': { label: 'Not configured', tone: 'text-(--a-muted) bg-(--a-soft) ring-(--a-border)', icon: Server },
}

function depStatus(key: string): DependencyStatus {
  const deps = health.value?.dependencies
  if (!deps) return 'not-configured'
  const entry = deps[key as keyof typeof deps]
  return entry?.status ?? 'not-configured'
}

function depProvider(key: string): string {
  const deps = health.value?.dependencies
  if (!deps) return ''
  const entry = deps[key as keyof typeof deps]
  return (entry as { provider?: string })?.provider ?? ''
}

function uptimeLabel(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

onMounted(() => {
  void load()
  timer = setInterval(() => void load(), 15_000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <div class="w-full space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="font-display text-xl font-bold text-(--a-text)">System Health</h1>
        <p class="mt-0.5 text-sm text-(--a-muted)">API, dependencies, error rate and latency. Auto-refreshes every 15s.</p>
      </div>
      <BaseButton :loading="loading" @click="load">
        <Activity class="h-4 w-4" /> Refresh
      </BaseButton>
    </div>

    <div v-if="loading && !health" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <BaseSkeleton v-for="n in 4" :key="n" class="h-32 w-full" />
    </div>

    <p v-else-if="error" class="text-sm text-rose-300">{{ error }}</p>

    <template v-else-if="health">
      <!-- Dependencies -->
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div
          v-for="key in (['mongodb', 'redis', 'smmProvider', 'paymentProvider'] as const)"
          :key="key"
          class="glass rounded-xl p-4 shadow-card"
        >
          <div class="flex items-center justify-between">
            <p class="text-[13px] text-(--a-muted)">{{ key === 'mongodb' ? 'MongoDB' : key === 'redis' ? 'Redis' : key === 'smmProvider' ? 'SMM Provider' : 'Payment Provider' }}</p>
            <span v-if="depProvider(key)" class="text-[10px] text-(--a-muted-3)">{{ depProvider(key) }}</span>
          </div>
          <div class="mt-2 flex items-center gap-2">
            <component
              :is="STATUS_META[depStatus(key)].icon"
              class="h-4 w-4"
              :class="STATUS_META[depStatus(key)].tone.split(' ')[0]"
            />
            <span
              class="rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1"
              :class="STATUS_META[depStatus(key)].tone"
            >
              {{ STATUS_META[depStatus(key)].label }}
            </span>
          </div>
        </div>
      </div>

      <!-- API metrics -->
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div class="glass rounded-xl p-4 shadow-card">
          <p class="text-[13px] text-(--a-muted)">Requests (window)</p>
          <p class="font-display mt-1.5 text-xl font-bold text-(--a-text)">{{ formatNumber(health.metrics.totalRequests) }}</p>
        </div>
        <div class="glass rounded-xl p-4 shadow-card">
          <p class="text-[13px] text-(--a-muted)">Error rate</p>
          <p class="font-display mt-1.5 text-xl font-bold" :class="health.metrics.errorRate > 0.05 ? 'text-rose-300' : 'text-(--a-text)'">
            {{ (health.metrics.errorRate * 100).toFixed(2) }}%
          </p>
        </div>
        <div class="glass rounded-xl p-4 shadow-card">
          <p class="text-[13px] text-(--a-muted)">Latency p95</p>
          <p class="font-display mt-1.5 text-xl font-bold text-(--a-text)">{{ health.metrics.latency.p95 }}ms</p>
        </div>
        <div class="glass rounded-xl p-4 shadow-card">
          <p class="text-[13px] text-(--a-muted)">Uptime</p>
          <p class="font-display mt-1.5 text-xl font-bold text-(--a-text)">{{ uptimeLabel(health.metrics.uptimeSeconds) }}</p>
        </div>
      </div>

      <!-- Deployment -->
      <div class="glass rounded-xl p-4 shadow-card">
        <h2 class="flex items-center gap-2 font-display text-sm font-semibold text-(--a-text)">
          <ShieldCheck class="h-4 w-4 text-brand-300" /> Deployment
        </h2>
        <div class="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><span class="text-(--a-muted)">Service</span> <span class="ml-2 font-medium text-(--a-text)">{{ health.service }}</span></div>
          <div><span class="text-(--a-muted)">Version</span> <span class="ml-2 font-medium text-(--a-text)">{{ health.version }}</span></div>
          <div><span class="text-(--a-muted)">Environment</span> <span class="ml-2 font-medium text-(--a-text)">{{ health.environment }}</span></div>
          <div><span class="text-(--a-muted)">Sentry</span> <span class="ml-2 font-medium text-(--a-text)">{{ health.sentryEnabled ? 'Enabled' : 'Disabled' }}</span></div>
        </div>
      </div>

      <!-- Top routes -->
      <div class="glass overflow-hidden rounded-xl shadow-card">
        <div class="border-b border-(--a-border) px-5 py-3">
          <h2 class="flex items-center gap-2 font-display text-sm font-semibold text-(--a-text)">
            <Gauge class="h-4 w-4 text-brand-300" /> Top routes (last 5 min)
          </h2>
        </div>
        <div v-if="health.metrics.topRoutes.length === 0" class="px-5 py-6 text-sm text-(--a-muted-2)">No requests yet.</div>
        <table v-else class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-(--a-muted-3)">
              <th class="px-5 py-2.5 font-semibold">Route</th>
              <th class="px-3 py-2.5 font-semibold">Count</th>
              <th class="px-3 py-2.5 font-semibold">Errors</th>
              <th class="px-3 py-2.5 font-semibold">p50</th>
              <th class="px-3 py-2.5 font-semibold">Last error</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-(--a-border)">
            <tr v-for="route in health.metrics.topRoutes" :key="`${route.method}-${route.route}`">
              <td class="px-5 py-2.5 font-mono text-xs text-(--a-text)">
                <span class="mr-1.5 rounded bg-(--a-soft) px-1.5 py-0.5 font-semibold text-(--a-muted)">{{ route.method }}</span>
                {{ route.route }}
              </td>
              <td class="px-3 py-2.5 text-(--a-text)">{{ formatNumber(route.count) }}</td>
              <td class="px-3 py-2.5" :class="route.errorCount > 0 ? 'text-rose-300' : 'text-(--a-muted-2)'">{{ route.errorCount }}</td>
              <td class="px-3 py-2.5 text-(--a-muted)">{{ Math.round(route.lastDurationMs) }}ms</td>
              <td class="px-3 py-2.5 text-xs text-(--a-muted-2)">{{ route.lastErrorAt ? new Date(route.lastErrorAt).toLocaleTimeString() : '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
