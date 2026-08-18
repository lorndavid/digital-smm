<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Search,
  ShieldAlert,
  XCircle,
} from '@lucide/vue'
import { adminApi } from '@/api/admin.api'
import { formatNumber } from '@/utils/format'
import type { Incident, IncidentSeverity, IncidentStatus } from '@/types/models'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseSkeleton from '@/components/ui/BaseSkeleton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'

const items = ref<Incident[]>([])
const total = ref(0)
const loading = ref(true)
const error = ref('')
const search = ref('')
const statusFilter = ref<'all' | IncidentStatus>('all')
const resolving = ref<string | null>(null)
let timer: ReturnType<typeof setInterval> | null = null

const SEVERITY_META: Record<IncidentSeverity, { label: string; tone: string }> = {
  critical: { label: 'Critical', tone: 'text-rose-300 bg-rose-400/10 ring-rose-400/30' },
  error: { label: 'Error', tone: 'text-orange-300 bg-orange-400/10 ring-orange-400/30' },
  warning: { label: 'Warning', tone: 'text-amber-300 bg-amber-400/10 ring-amber-400/30' },
}

const STATUS_META: Record<IncidentStatus, { label: string; tone: string }> = {
  open: { label: 'OPEN', tone: 'text-rose-300 bg-rose-400/10 ring-rose-400/30' },
  investigating: { label: 'INVESTIGATING', tone: 'text-amber-300 bg-amber-400/10 ring-amber-400/30' },
  resolved: { label: 'RESOLVED', tone: 'text-emerald-300 bg-emerald-400/10 ring-emerald-400/30' },
}

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return items.value.filter((i) => {
    const matchesStatus = statusFilter.value === 'all' || i.status === statusFilter.value
    const matchesSearch =
      !q ||
      i.title.toLowerCase().includes(q) ||
      i.key.toLowerCase().includes(q) ||
      i.service.toLowerCase().includes(q)
    return matchesStatus && matchesSearch
  })
})

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const res = await adminApi.listIncidents({ limit: 100 })
    items.value = res.items
    total.value = res.total
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load incidents'
  } finally {
    loading.value = false
  }
}

async function resolve(id: string): Promise<void> {
  resolving.value = id
  try {
    await adminApi.resolveIncident(id)
    await load()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to resolve incident'
  } finally {
    resolving.value = null
  }
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

onMounted(() => {
  void load()
  timer = setInterval(() => void load(), 30_000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <div class="w-full space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="font-display text-xl font-bold text-(--a-text)">Incidents</h1>
        <p class="mt-0.5 text-sm text-(--a-muted)">
          Operational failures detected by the alert system. Repeated identical failures update one incident.
        </p>
      </div>
      <BaseButton :loading="loading" @click="load">
        <RefreshCw class="h-4 w-4" /> Refresh
      </BaseButton>
    </div>

    <!-- Filters -->
    <div class="flex flex-wrap items-center gap-3">
      <div class="relative w-full max-w-xs">
        <Search class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-(--a-muted-3)" />
        <BaseInput v-model="search" placeholder="Search title / key / service" class="pl-9" />
      </div>
      <div class="flex gap-1.5">
        <button
          v-for="opt in (['all', 'open', 'investigating', 'resolved'] as const)"
          :key="opt"
          class="rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition"
          :class="
            statusFilter === opt
              ? 'bg-brand-500/15 text-brand-200 ring-brand-400/40'
              : 'text-(--a-muted) ring-(--a-border) hover:text-(--a-text)'
          "
          @click="statusFilter = opt"
        >
          {{ opt === 'all' ? `All (${total})` : opt }}
        </button>
      </div>
    </div>

    <p v-if="error" class="text-sm text-rose-300">{{ error }}</p>

    <div v-if="loading && items.length === 0" class="space-y-2">
      <BaseSkeleton v-for="n in 5" :key="n" class="h-14 w-full" />
    </div>

    <div v-else class="glass overflow-hidden rounded-xl shadow-card">
      <div v-if="filtered.length === 0" class="px-5 py-10 text-center text-sm text-(--a-muted-2)">
        <ShieldAlert class="mx-auto mb-2 h-6 w-6 opacity-60" />
        No incidents{{ statusFilter !== 'all' ? ` with status "${statusFilter}"` : '' }}.
      </div>
      <table v-else class="w-full text-sm">
        <thead>
          <tr class="text-left text-xs text-(--a-muted-3)">
            <th class="px-5 py-2.5 font-semibold">Severity</th>
            <th class="px-3 py-2.5 font-semibold">Title</th>
            <th class="px-3 py-2.5 font-semibold">Service</th>
            <th class="px-3 py-2.5 font-semibold">Occurrences</th>
            <th class="px-3 py-2.5 font-semibold">First seen</th>
            <th class="px-3 py-2.5 font-semibold">Last seen</th>
            <th class="px-3 py-2.5 font-semibold">Status</th>
            <th class="px-3 py-2.5 font-semibold">Action</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-(--a-border)">
          <tr v-for="inc in filtered" :key="inc.id" class="align-top">
            <td class="px-5 py-3">
              <span
                class="rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1"
                :class="SEVERITY_META[inc.severity].tone"
              >
                {{ SEVERITY_META[inc.severity].label }}
              </span>
            </td>
            <td class="px-3 py-3">
              <p class="font-medium text-(--a-text)">{{ inc.title }}</p>
              <p class="mt-0.5 font-mono text-[11px] text-(--a-muted-2)">{{ inc.key }}</p>
              <p v-if="inc.message" class="mt-1 max-w-md truncate text-xs text-(--a-muted)">
                {{ inc.message }}
              </p>
            </td>
            <td class="px-3 py-3 text-(--a-muted)">{{ inc.service }}</td>
            <td class="px-3 py-3 text-(--a-text)">{{ formatNumber(inc.occurrences) }}</td>
            <td class="px-3 py-3 text-xs text-(--a-muted)">{{ fmtTime(inc.firstSeenAt) }}</td>
            <td class="px-3 py-3 text-xs text-(--a-muted)">{{ fmtTime(inc.lastSeenAt) }}</td>
            <td class="px-3 py-3">
              <span
                class="rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1"
                :class="STATUS_META[inc.status].tone"
              >
                {{ STATUS_META[inc.status].label }}
              </span>
              <p v-if="inc.resolutionReason" class="mt-1 max-w-[160px] truncate text-[11px] text-(--a-muted-2)">
                {{ inc.resolutionReason }}
              </p>
            </td>
            <td class="px-3 py-3">
              <BaseButton
                v-if="inc.status !== 'resolved'"
                size="sm"
                variant="ghost"
                :loading="resolving === inc.id"
                @click="resolve(inc.id)"
              >
                <CheckCircle2 class="h-3.5 w-3.5" /> Resolve
              </BaseButton>
              <span v-else class="text-xs text-(--a-muted-3)">
                <XCircle class="mr-1 inline h-3.5 w-3.5" />Closed
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="flex items-center gap-1.5 text-xs text-(--a-muted-3)">
      <AlertTriangle class="h-3.5 w-3.5" />
      Auto-refreshes every 30s. Resolving an incident marks it closed; a new occurrence reopens it.
    </p>
  </div>
</template>
