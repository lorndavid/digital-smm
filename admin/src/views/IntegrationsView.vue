<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight, CircleAlert, CircleCheck, CircleOff, Plug, RefreshCcw } from '@lucide/vue'
import { adminApi } from '@/api/admin.api'
import { useToast } from '@/composables/useToast'
import { ALL_INTEGRATION_PROVIDERS, INTEGRATION_PROVIDER_META } from '@/utils/integrations'
import type { IntegrationProviderKey, IntegrationSummary, IntegrationStatus } from '@/types/models'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseSkeleton from '@/components/ui/BaseSkeleton.vue'

const router = useRouter()
const toast = useToast()

const items = ref<IntegrationSummary[]>([])
const loading = ref(true)
const testing = ref<IntegrationProviderKey | null>(null)

const STATUS_META: Record<
  IntegrationStatus,
  { label: string; dot: string; text: string; icon: typeof CircleCheck }
> = {
  CONNECTED: { label: 'Connected', dot: 'bg-emerald-400', text: 'text-emerald-300', icon: CircleCheck },
  NOT_CONFIGURED: { label: 'Not configured', dot: 'bg-(--a-muted-3)', text: 'text-(--a-muted-2)', icon: CircleOff },
  CONNECTION_FAILED: { label: 'Connection failed', dot: 'bg-rose-400', text: 'text-rose-300', icon: CircleAlert },
  DISABLED: { label: 'Disabled', dot: 'bg-amber-400', text: 'text-amber-300', icon: CircleOff },
  TESTING: { label: 'Testing…', dot: 'bg-sky-400 animate-pulse', text: 'text-sky-300', icon: RefreshCcw },
  EXPIRED: { label: 'Expired', dot: 'bg-amber-400', text: 'text-amber-300', icon: CircleAlert },
}

const byProvider = computed(() => new Map(items.value.map((i) => [i.provider, i])))

function summary(key: IntegrationProviderKey): IntegrationSummary | undefined {
  return byProvider.value.get(key)
}

async function load(): Promise<void> {
  loading.value = true
  try {
    items.value = await adminApi.listIntegrations()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Failed to load integrations')
  } finally {
    loading.value = false
  }
}

async function test(key: IntegrationProviderKey): Promise<void> {
  testing.value = key
  try {
    const result = await adminApi.testIntegration(key)
    if (result.success) {
      toast.success(`${INTEGRATION_PROVIDER_META[key].name} connected (${result.latencyMs}ms)`)
    } else {
      toast.error(`${INTEGRATION_PROVIDER_META[key].name}: ${result.message ?? 'Connection failed'}`)
    }
    await load()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Test failed')
  } finally {
    testing.value = null
  }
}

function open(key: IntegrationProviderKey): void {
  router.push(`/integrations/${key}`)
}

onMounted(() => void load())
</script>

<template>
  <div class="w-full space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="font-display text-xl font-bold text-(--a-text)">Integrations</h1>
        <p class="mt-0.5 text-sm text-(--a-muted)">
          Manage external services connected to your platform. Credentials are encrypted before storage.
        </p>
      </div>
      <BaseButton variant="outline" :loading="loading" @click="load">
        <RefreshCcw class="h-4 w-4" /> Refresh
      </BaseButton>
    </div>

    <div v-if="loading" class="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      <BaseSkeleton v-for="n in 3" :key="n" class="h-44 w-full" />
    </div>

    <div v-else class="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      <div
        v-for="meta in ALL_INTEGRATION_PROVIDERS"
        :key="meta.key"
        class="glass group flex flex-col rounded-xl p-5 shadow-card transition-colors hover:border-brand-400/40"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/15 text-brand-300">
              <component :is="meta.icon" class="h-5 w-5" />
            </div>
            <div>
              <h2 class="font-display text-sm font-semibold text-(--a-text)">{{ meta.name }}</h2>
              <p class="mt-0.5 text-xs text-(--a-muted-2)">{{ meta.key }}</p>
            </div>
          </div>
          <span
            class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-(--a-border)"
            :class="STATUS_META[summary(meta.key)?.status ?? 'NOT_CONFIGURED'].text"
          >
            <span
              class="h-2 w-2 rounded-full"
              :class="STATUS_META[summary(meta.key)?.status ?? 'NOT_CONFIGURED'].dot"
            />
            {{ STATUS_META[summary(meta.key)?.status ?? 'NOT_CONFIGURED'].label }}
          </span>
        </div>

        <p class="mt-3 flex-1 text-[13px] leading-relaxed text-(--a-muted)">{{ meta.description }}</p>

        <div class="mt-4 flex flex-wrap items-center gap-2 text-xs text-(--a-muted-2)">
          <template v-if="summary(meta.key)?.configured">
            <span>Last tested: {{ summary(meta.key)?.lastTestedAt ? new Date(summary(meta.key)!.lastTestedAt!).toLocaleString() : 'never' }}</span>
            <span v-if="summary(meta.key)?.latencyMs" class="text-(--a-muted-3)">· {{ summary(meta.key)?.latencyMs }}ms</span>
          </template>
          <span v-else>Not configured yet</span>
        </div>

        <div class="mt-4 flex items-center gap-2">
          <BaseButton size="sm" variant="outline" @click="open(meta.key)">
            {{ summary(meta.key)?.configured ? 'Manage' : 'Configure' }}
            <ArrowRight class="h-3.5 w-3.5" />
          </BaseButton>
          <BaseButton
            v-if="meta.supportsTest"
            size="sm"
            variant="ghost"
            :loading="testing === meta.key"
            :disabled="!summary(meta.key)?.configured || summary(meta.key)?.status === 'DISABLED'"
            @click="test(meta.key)"
          >
            <Plug class="h-3.5 w-3.5" /> Test connection
          </BaseButton>
        </div>
      </div>
    </div>
  </div>
</template>
