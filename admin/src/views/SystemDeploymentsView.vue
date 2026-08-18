<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RefreshCw, Rocket, RotateCcw } from '@lucide/vue'
import { adminApi } from '@/api/admin.api'
import type { DeploymentRecord, DeploymentStatus } from '@/types/models'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseSkeleton from '@/components/ui/BaseSkeleton.vue'

const items = ref<DeploymentRecord[]>([])
const total = ref(0)
const loading = ref(true)
const error = ref('')
const serviceFilter = ref<'all' | DeploymentRecord['service']>('all')

const STATUS_META: Record<DeploymentStatus, { label: string; tone: string }> = {
  success: { label: 'SUCCESS', tone: 'text-emerald-300 bg-emerald-400/10 ring-emerald-400/30' },
  failed: { label: 'FAILED', tone: 'text-rose-300 bg-rose-400/10 ring-rose-400/30' },
  'in-progress': { label: 'IN PROGRESS', tone: 'text-amber-300 bg-amber-400/10 ring-amber-400/30' },
  'rolled-back': { label: 'ROLLED BACK', tone: 'text-orange-300 bg-orange-400/10 ring-orange-400/30' },
}

const filtered = computed(() => {
  if (serviceFilter.value === 'all') return items.value
  return items.value.filter((d) => d.service === serviceFilter.value)
})

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const res = await adminApi.listDeployments({ limit: 100 })
    items.value = res.items
    total.value = res.total
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load deployments'
  } finally {
    loading.value = false
  }
}

function duration(d: DeploymentRecord): string {
  if (d.status === 'in-progress' || d.durationMs <= 0) return '—'
  if (d.durationMs < 1000) return `${Math.round(d.durationMs)}ms`
  return `${(d.durationMs / 1000).toFixed(1)}s`
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

onMounted(() => void load())
</script>

<template>
  <div class="w-full space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="font-display text-xl font-bold text-(--a-text)">Deployments</h1>
        <p class="mt-0.5 text-sm text-(--a-muted)">
          Deployment history across frontend, admin and backend — the last known-good version is the rollback target.
        </p>
      </div>
      <BaseButton :loading="loading" @click="load">
        <RefreshCw class="h-4 w-4" /> Refresh
      </BaseButton>
    </div>

    <div class="flex gap-1.5">
      <button
        v-for="opt in (['all', 'frontend', 'admin', 'backend'] as const)"
        :key="opt"
        class="rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition"
        :class="
          serviceFilter === opt
            ? 'bg-brand-500/15 text-brand-200 ring-brand-400/40'
            : 'text-(--a-muted) ring-(--a-border) hover:text-(--a-text)'
        "
        @click="serviceFilter = opt"
      >
        {{ opt === 'all' ? `All (${total})` : opt }}
      </button>
    </div>

    <p v-if="error" class="text-sm text-rose-300">{{ error }}</p>

    <div v-if="loading && items.length === 0" class="space-y-2">
      <BaseSkeleton v-for="n in 5" :key="n" class="h-14 w-full" />
    </div>

    <div v-else class="glass overflow-hidden rounded-xl shadow-card">
      <div v-if="filtered.length === 0" class="px-5 py-10 text-center text-sm text-(--a-muted-2)">
        <Rocket class="mx-auto mb-2 h-6 w-6 opacity-60" />
        No deployments recorded yet. They appear here after the first CI/CD deployment.
      </div>
      <table v-else class="w-full text-sm">
        <thead>
          <tr class="text-left text-xs text-(--a-muted-3)">
            <th class="px-5 py-2.5 font-semibold">Service</th>
            <th class="px-3 py-2.5 font-semibold">Status</th>
            <th class="px-3 py-2.5 font-semibold">Version</th>
            <th class="px-3 py-2.5 font-semibold">Commit</th>
            <th class="px-3 py-2.5 font-semibold">Environment</th>
            <th class="px-3 py-2.5 font-semibold">Started</th>
            <th class="px-3 py-2.5 font-semibold">Duration</th>
            <th class="px-3 py-2.5 font-semibold">Rollback to</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-(--a-border)">
          <tr v-for="d in filtered" :key="d.id">
            <td class="px-5 py-3">
              <span class="flex items-center gap-2 font-medium text-(--a-text)">
                <Rocket class="h-3.5 w-3.5 text-brand-300" />
                {{ d.service }}
              </span>
            </td>
            <td class="px-3 py-3">
              <span
                class="rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1"
                :class="STATUS_META[d.status].tone"
              >
                {{ STATUS_META[d.status].label }}
              </span>
            </td>
            <td class="px-3 py-3 font-mono text-xs text-(--a-text)">{{ d.version || '—' }}</td>
            <td class="px-3 py-3 font-mono text-xs text-(--a-muted)">
              {{ d.commit ? d.commit.slice(0, 12) : '—' }}
            </td>
            <td class="px-3 py-3 text-(--a-muted)">{{ d.environment }}</td>
            <td class="px-3 py-3 text-xs text-(--a-muted)">{{ fmtTime(d.startedAt) }}</td>
            <td class="px-3 py-3 text-(--a-muted)">{{ duration(d) }}</td>
            <td class="px-3 py-3">
              <span v-if="d.rollbackTo" class="flex items-center gap-1 text-xs text-orange-300">
                <RotateCcw class="h-3 w-3" /> {{ d.rollbackTo.slice(0, 12) }}
              </span>
              <span v-else class="text-xs text-(--a-muted-3)">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
