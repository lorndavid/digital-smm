<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft,
  CheckCircle2,
  EyeOff,
  History,
  Plug,
  RefreshCcw,
  Save,
  Send,
  ShieldAlert,
  Trash2,
  XCircle,
  Zap,
} from '@lucide/vue'
import { adminApi } from '@/api/admin.api'
import { useToast } from '@/composables/useToast'
import { DESTINATION_TYPE_OPTIONS, INTEGRATION_PROVIDER_META } from '@/utils/integrations'
import type {
  IntegrationDestinationType,
  IntegrationProviderKey,
  IntegrationSendResult,
  IntegrationSummary,
  IntegrationTestResult,
} from '@/types/models'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'

const route = useRoute()
const router = useRouter()
const toast = useToast()

const provider = route.params.provider as IntegrationProviderKey
const meta = INTEGRATION_PROVIDER_META[provider]

const integration = ref<IntegrationSummary | null>(null)
const loading = ref(true)
const saving = ref(false)
const testing = ref(false)
const sending = ref(false)
const deleting = ref(false)

/** Non-secret form values (baseUrl, providerName, destinationType, ...). */
const configForm = reactive<Record<string, string>>({})
/** Secret values the admin is actively entering (only sent when set). */
const secretForm = reactive<Record<string, string>>({})
/** Secret fields currently in "replace" mode. */
const replaceMode = reactive<Record<string, boolean>>({})

interface DestRow {
  id: number
  type: IntegrationDestinationType
  chatId: string
  label: string
  configured: boolean
  masked: string | null
  editing: boolean
  removed: boolean
}

/** Telegram destinations being edited (configured rows keep their stored value). */
const destRows = ref<DestRow[]>([])
let destIdSeq = 1

function addDestinationRow(): void {
  destRows.value.push({ id: destIdSeq++, type: 'private', chatId: '', label: '', configured: false, masked: null, editing: true, removed: false })
}

function removeDestinationRow(id: number): void {
  const row = destRows.value.find((r) => r.id === id)
  if (row) row.removed = true
}

function destinationsDirty(): boolean {
  const active = destRows.value.filter((r) => !r.removed)
  const stored = integration.value?.destinations ?? []
  if (active.length !== stored.length) return true
  return active.some((row, i) => {
    const storedRow = stored[i]
    if (!storedRow) return true
    if (row.type !== storedRow.type) return true
    // A configured row that is not being edited keeps its stored value.
    if (row.configured && !row.editing) return false
    return (row.chatId ?? '') !== ''
  })
}

const dirty = computed(() => {
  if (!integration.value) return false
  const nonSecretKeys = meta.fields.filter((f) => f.type !== 'secret')
  const configChanged = nonSecretKeys.some((f) => (configForm[f.key] ?? '') !== String(integration.value?.config[f.key] ?? ''))
  const secretChanged = meta.fields.some((f) => {
    if (f.type !== 'secret') return false
    const view = integration.value?.credentials[f.key]
    if (!view?.configured) return (secretForm[f.key] ?? '') !== ''
    return replaceMode[f.key] === true && (secretForm[f.key] ?? '') !== ''
  })
  return configChanged || secretChanged || destinationsDirty()
})

onBeforeRouteLeave(() => {
  if (dirty.value) {
    return window.confirm('You have unsaved changes. Leave anyway?')
  }
  return true
})

async function load(): Promise<void> {
  loading.value = true
  try {
    integration.value = await adminApi.getIntegration(provider)
    // Seed non-secret form values from the stored config.
    for (const field of meta.fields) {
      if (field.type === 'secret') continue
      configForm[field.key] = String(integration.value.config[field.key] ?? '')
    }
    // Seed Telegram destination rows (configured rows start read-only).
    destRows.value = (integration.value.destinations ?? []).map((d) => ({
      id: destIdSeq++,
      type: d.type,
      chatId: '',
      label: d.label,
      configured: d.configured,
      masked: d.masked,
      editing: false,
      removed: false,
    }))
    if (meta.supportsMultipleDestinations && destRows.value.length === 0) {
      addDestinationRow()
    }
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Failed to load integration')
  } finally {
    loading.value = false
  }
}

function enterReplaceMode(fieldKey: string): void {
  replaceMode[fieldKey] = true
  secretForm[fieldKey] = ''
}

function cancelReplace(fieldKey: string): void {
  replaceMode[fieldKey] = false
  secretForm[fieldKey] = ''
}

async function save(): Promise<void> {
  saving.value = true
  try {
    const secrets: Record<string, string> = {}
    for (const field of meta.fields) {
      if (field.type !== 'secret') continue
      const view = integration.value?.credentials[field.key]
      if (!view?.configured) {
        if ((secretForm[field.key] ?? '') !== '') secrets[field.key] = secretForm[field.key]
      } else if (replaceMode[field.key]) {
        secrets[field.key] = secretForm[field.key] ?? ''
      }
    }
    const config: Record<string, unknown> = {}
    for (const field of meta.fields) {
      if (field.type === 'secret') continue
      config[field.key] = configForm[field.key] ?? ''
    }

    // Telegram destinations: full list. Configured rows that are not being
    // edited are sent with retain:true so the stored value is kept.
    const destinations = meta.supportsMultipleDestinations
      ? destRows.value
          .filter((r) => !r.removed)
          .map((row) => {
            if (row.configured && !row.editing) return { type: row.type, retain: true as const }
            return { type: row.type, chatId: (row.chatId ?? '').trim() }
          })
      : undefined

    const saved = await adminApi.saveIntegration(provider, { secrets, config, destinations })
    integration.value = saved
    for (const key of Object.keys(replaceMode)) replaceMode[key] = false
    await load()
    toast.success(`${meta.name} saved`)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Failed to save')
  } finally {
    saving.value = false
  }
}

const testSteps = ref<Array<{ label: string; done: boolean }>>([])
const testResult = ref<IntegrationTestResult | null>(null)

async function testConnection(): Promise<void> {
  testing.value = true
  testResult.value = null
  if (provider === 'telegram') {
    testSteps.value = [
      { label: 'Checking bot credentials', done: false },
      { label: 'Checking destination', done: false },
      { label: 'Measuring response', done: false },
    ]
  }
  try {
    const result = await adminApi.testIntegration(provider)
    if (provider === 'telegram') {
      testSteps.value.forEach((s) => (s.done = true))
    }
    testResult.value = result
    if (result.success) {
      toast.success(`Connection successful (${result.latencyMs}ms)`)
    } else {
      toast.error(result.message ?? 'Connection failed')
    }
    await load()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Test failed')
  } finally {
    testing.value = false
  }
}

const showSendDialog = ref(false)
const sendResults = ref<IntegrationSendResult[] | null>(null)

async function sendTestMessage(): Promise<void> {
  sending.value = true
  sendResults.value = null
  try {
    const result = await adminApi.sendTelegramTestMessage()
    sendResults.value = result.results
    if (result.failed === 0) {
      toast.success(`Test message sent to ${result.sent} destination${result.sent === 1 ? '' : 's'}`)
      showSendDialog.value = false
    } else {
      toast.error(`${result.sent} sent, ${result.failed} failed`)
    }
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Failed to send test message')
  } finally {
    sending.value = false
  }
}

function testDestinationResults(): Array<{ type: string; chatId: string; ok: boolean; errorCode?: string; message?: string }> {
  const dests = testResult.value?.details?.destinations
  return Array.isArray(dests) ? (dests as Array<{ type: string; chatId: string; ok: boolean; errorCode?: string; message?: string }>) : []
}

const showDeleteDialog = ref(false)

async function removeIntegration(): Promise<void> {
  deleting.value = true
  try {
    await adminApi.deleteIntegration(provider)
    toast.success(`${meta.name} integration removed`)
    showDeleteDialog.value = false
    router.push('/integrations')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Failed to delete')
  } finally {
    deleting.value = false
  }
}

async function toggleEnabled(): Promise<void> {
  if (!integration.value) return
  const next = !integration.value.enabled
  try {
    integration.value = await adminApi.setIntegrationEnabled(provider, next)
    toast.success(next ? `${meta.name} enabled` : `${meta.name} disabled`)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Failed to update')
  }
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return new Date(iso).toLocaleDateString()
}

const statusLabel = computed(() => {
  switch (integration.value?.status) {
    case 'CONNECTED':
      return { label: 'Connected', cls: 'text-emerald-300 bg-emerald-400/10 ring-emerald-400/30' }
    case 'CONNECTION_FAILED':
      return { label: 'Connection failed', cls: 'text-rose-300 bg-rose-400/10 ring-rose-400/30' }
    case 'DISABLED':
      return { label: 'Disabled', cls: 'text-amber-300 bg-amber-400/10 ring-amber-400/30' }
    case 'TESTING':
      return { label: 'Testing…', cls: 'text-sky-300 bg-sky-400/10 ring-sky-400/30' }
    default:
      return { label: 'Not configured', cls: 'text-(--a-muted) bg-(--a-soft) ring-(--a-border)' }
  }
})

onMounted(() => void load())
</script>

<template>
  <div class="w-full space-y-5">
    <button class="inline-flex items-center gap-1.5 text-sm text-(--a-muted) transition-colors hover:text-(--a-text)" @click="router.push('/integrations')">
      <ArrowLeft class="h-4 w-4" /> Integrations
    </button>

    <div v-if="loading && !integration" class="glass rounded-xl p-6">
      <p class="text-sm text-(--a-muted-2)">Loading…</p>
    </div>

    <template v-else>
      <!-- Header -->
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <div class="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500/15 text-brand-300">
            <component :is="meta.icon" class="h-5 w-5" />
          </div>
          <div>
            <h1 class="font-display text-xl font-bold text-(--a-text)">{{ meta.name }}</h1>
            <p class="mt-0.5 text-sm text-(--a-muted)">{{ meta.description }}</p>
          </div>
        </div>
        <span class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1" :class="statusLabel.cls">
          <span class="h-2 w-2 rounded-full" :class="integration?.status === 'CONNECTED' ? 'bg-emerald-400' : integration?.status === 'CONNECTION_FAILED' ? 'bg-rose-400' : 'bg-current opacity-60'" />
          {{ statusLabel.label }}
        </span>
      </div>

      <div class="grid gap-5 lg:grid-cols-3">
        <!-- Configuration -->
        <div class="glass rounded-xl p-5 shadow-card lg:col-span-2">
          <h2 class="flex items-center gap-2 font-display text-sm font-semibold text-(--a-text)">
            <Zap class="h-4 w-4 text-brand-300" /> Configuration
          </h2>

          <div class="mt-4 space-y-4">
            <!-- Non-secret fields -->
            <BaseInput
              v-for="field in meta.fields.filter((f) => f.type !== 'secret')"
              :key="field.key"
              :label="field.label"
              :hint="field.hint"
              :placeholder="field.placeholder"
              :model-value="configForm[field.key] ?? ''"
              @update:model-value="configForm[field.key] = String($event)"
            />

            <!-- Telegram destinations (multi-chat: personal, group, supergroup, channel) -->
            <div v-if="meta.supportsMultipleDestinations" class="rounded-lg border border-(--a-border) bg-(--a-soft)/40 p-3.5">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="text-[13px] font-medium text-(--a-text-soft)">Destinations</p>
                  <p class="mt-0.5 text-xs text-(--a-muted-2)">
                    Personal chats, groups, supergroups and channels — the bot sends to every listed destination.
                    For personal chats the recipient must press <b>Start</b> on the bot once.
                  </p>
                </div>
              </div>

              <div class="mt-3 space-y-2.5">
                <div v-for="row in destRows.filter((r) => !r.removed)" :key="row.id" class="rounded-lg border border-(--a-border) bg-(--a-soft)/40 p-3">
                  <template v-if="row.configured && !row.editing">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <div class="min-w-0">
                        <p class="flex items-center gap-2 font-mono text-sm text-(--a-muted)">
                          {{ row.masked }}
                          <span class="rounded bg-brand-500/15 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-brand-300">
                            {{ row.type }}
                          </span>
                        </p>
                        <p class="mt-0.5 text-xs text-emerald-300">● Configured — encrypted at rest</p>
                      </div>
                      <div class="flex gap-1.5">
                        <BaseButton size="sm" variant="outline" @click="row.editing = true">Replace</BaseButton>
                        <BaseButton size="sm" variant="ghost" class="!text-rose-300 hover:!text-rose-200" @click="removeDestinationRow(row.id)">
                          Remove
                        </BaseButton>
                      </div>
                    </div>
                  </template>
                  <template v-else>
                    <div class="grid gap-2 sm:grid-cols-[1fr_180px]">
                      <BaseInput
                        :model-value="row.chatId"
                        placeholder="123456789 (personal) · -100… (group/channel) · @username"
                        @update:model-value="row.chatId = String($event)"
                      />
                      <select
                        :value="row.type"
                        class="h-9.5 w-full rounded-lg border border-(--a-border) bg-(--a-soft) px-3.5 text-sm text-(--a-text) transition-colors focus:border-brand-400/60 focus:outline-none focus:ring-2 focus:ring-brand-400/30"
                        @change="row.type = ($event.target as HTMLSelectElement).value as typeof row.type"
                      >
                        <option v-for="opt in DESTINATION_TYPE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                      </select>
                    </div>
                    <div class="mt-2 flex items-center justify-between gap-2">
                      <p class="flex items-center gap-1 text-xs text-(--a-muted-2)">
                        <EyeOff class="h-3.5 w-3.5" /> Encrypted before storage.
                      </p>
                      <div class="flex gap-1.5">
                        <BaseButton v-if="row.configured" size="sm" variant="ghost" @click="row.editing = false">Cancel</BaseButton>
                        <BaseButton size="sm" variant="ghost" class="!text-rose-300 hover:!text-rose-200" @click="removeDestinationRow(row.id)">Remove</BaseButton>
                      </div>
                    </div>
                  </template>
                </div>

                <BaseButton
                  v-if="destRows.filter((r) => !r.removed).length < 25"
                  size="sm"
                  variant="outline"
                  @click="addDestinationRow"
                >
                  + Add destination
                </BaseButton>
              </div>
            </div>

            <!-- Enum fields (non-Telegram providers) -->
            <label v-for="field in meta.fields.filter((f) => f.type === 'enum')" :key="field.key" class="block">
              <span class="mb-1 block text-[13px] font-medium text-(--a-text-soft)">{{ field.label }}</span>
              <select
                :value="configForm[field.key] ?? ''"
                class="h-9.5 w-full rounded-lg border border-(--a-border) bg-(--a-soft) px-3.5 text-sm text-(--a-text) transition-colors focus:border-brand-400/60 focus:outline-none focus:ring-2 focus:ring-brand-400/30"
                @change="configForm[field.key] = ($event.target as HTMLSelectElement).value"
              >
                <option value="" disabled>Select…</option>
                <option v-for="opt in field.options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
            </label>

            <!-- Secret fields -->
            <div v-for="field in meta.fields.filter((f) => f.type === 'secret')" :key="field.key" class="rounded-lg border border-(--a-border) bg-(--a-soft)/40 p-3.5">
              <div class="flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <p class="text-[13px] font-medium text-(--a-text-soft)">{{ field.label }}</p>
                  <template v-if="integration?.credentials[field.key]?.configured && !replaceMode[field.key]">
                    <p class="mt-1 flex items-center gap-1.5 font-mono text-sm text-(--a-muted)">
                      {{ integration.credentials[field.key].masked }}
                    </p>
                    <p class="mt-0.5 text-xs text-emerald-300">● Configured — encrypted at rest</p>
                  </template>
                </div>
                <BaseButton
                  v-if="integration?.credentials[field.key]?.configured && !replaceMode[field.key]"
                  size="sm"
                  variant="outline"
                  @click="enterReplaceMode(field.key)"
                >
                  Replace {{ field.key === 'botToken' ? 'Token' : field.key === 'chatId' ? 'Chat ID' : 'Key' }}
                </BaseButton>
              </div>

              <div v-if="!integration?.credentials[field.key]?.configured || replaceMode[field.key]" class="mt-3 space-y-2">
                <BaseInput
                  :model-value="secretForm[field.key] ?? ''"
                  :placeholder="field.placeholder"
                  type="password"
                  autocomplete="new-password"
                  @update:model-value="secretForm[field.key] = String($event)"
                />
                <p class="flex items-center gap-1 text-xs text-(--a-muted-2)">
                  <EyeOff class="h-3.5 w-3.5" /> This value is encrypted before being stored and is never shown again.
                </p>
                <BaseButton v-if="replaceMode[field.key]" size="sm" variant="ghost" @click="cancelReplace(field.key)">
                  Cancel
                </BaseButton>
              </div>
            </div>

            <div class="flex items-center gap-2 pt-1">
              <BaseButton :loading="saving" :disabled="!dirty" @click="save">
                <Save class="h-4 w-4" /> Save Changes
              </BaseButton>
              <span v-if="dirty" class="text-xs text-amber-300">Unsaved changes</span>
            </div>
          </div>
        </div>

        <!-- Connection -->
        <div class="space-y-5">
          <div class="glass rounded-xl p-5 shadow-card">
            <h2 class="flex items-center gap-2 font-display text-sm font-semibold text-(--a-text)">
              <Plug class="h-4 w-4 text-brand-300" /> Connection
            </h2>
            <dl class="mt-3 space-y-2 text-sm">
              <div class="flex items-center justify-between">
                <dt class="text-(--a-muted)">Status</dt>
                <dd class="font-medium text-(--a-text)">{{ statusLabel.label }}</dd>
              </div>
              <div class="flex items-center justify-between">
                <dt class="text-(--a-muted)">Latency</dt>
                <dd class="font-medium text-(--a-text)">{{ integration?.latencyMs != null ? `${integration.latencyMs}ms` : '—' }}</dd>
              </div>
              <div class="flex items-center justify-between">
                <dt class="text-(--a-muted)">Last tested</dt>
                <dd class="font-medium text-(--a-text)">{{ relativeTime(integration?.lastTestedAt ?? null) }}</dd>
              </div>
              <div class="flex items-center justify-between">
                <dt class="text-(--a-muted)">Last success</dt>
                <dd class="font-medium text-emerald-300">{{ relativeTime(integration?.lastSuccessfulAt ?? null) }}</dd>
              </div>
              <div class="flex items-center justify-between">
                <dt class="text-(--a-muted)">Last failure</dt>
                <dd class="font-medium text-rose-300">{{ relativeTime(integration?.lastFailedAt ?? null) }}</dd>
              </div>
            </dl>

            <p
              v-if="testResult && !testResult.success"
              class="mt-3 rounded-lg bg-rose-400/10 px-3 py-2 text-xs text-rose-300"
            >
              {{ testResult.errorCode }} — {{ testResult.message }}
            </p>

            <!-- Per-destination test breakdown (Telegram) -->
            <div v-if="provider === 'telegram' && testDestinationResults().length > 0" class="mt-3 space-y-1.5">
              <div
                v-for="(d, idx) in testDestinationResults()"
                :key="idx"
                class="flex items-start justify-between gap-2 rounded-lg bg-(--a-soft) px-3 py-2 text-xs"
              >
                <span class="flex min-w-0 items-center gap-1.5" :class="d.ok ? 'text-emerald-300' : 'text-rose-300'">
                  <CheckCircle2 v-if="d.ok" class="h-3.5 w-3.5 shrink-0" />
                  <XCircle v-else class="h-3.5 w-3.5 shrink-0" />
                  <span class="truncate font-mono">{{ d.chatId }}</span>
                  <span class="shrink-0 rounded bg-(--a-hover) px-1.5 py-0.5 text-[10px] font-semibold text-(--a-muted)">{{ d.type }}</span>
                </span>
                <span class="shrink-0 text-right">{{ d.ok ? 'OK' : d.errorCode ?? 'failed' }}</span>
              </div>
              <p v-if="testResult && !testResult.success && testDestinationResults().some((d) => !d.ok)" class="text-xs text-(--a-muted-2)">
                {{ testDestinationResults().filter((d) => !d.ok)[0]?.message }}
              </p>
            </div>

            <div v-if="provider === 'telegram' && testing" class="mt-3 space-y-1.5">
              <div v-for="step in testSteps" :key="step.label" class="flex items-center gap-2 text-xs" :class="step.done ? 'text-emerald-300' : 'text-(--a-muted-2)'">
                <CheckCircle2 v-if="step.done" class="h-3.5 w-3.5" />
                <RefreshCcw v-else class="h-3.5 w-3.5 animate-spin" />
                {{ step.label }}
              </div>
            </div>

            <div class="mt-4 flex flex-wrap gap-2">
              <BaseButton
                v-if="meta.supportsTest"
                :loading="testing"
                :disabled="!integration?.configured || integration.status === 'DISABLED'"
                @click="testConnection"
              >
                <Plug class="h-4 w-4" /> Test Connection
              </BaseButton>
              <BaseButton
                v-if="meta.supportsSendTestMessage"
                variant="outline"
                :loading="sending"
                :disabled="!integration?.configured || integration.status !== 'CONNECTED'"
                @click="showSendDialog = true"
              >
                <Send class="h-4 w-4" /> Send Test Message
              </BaseButton>
            </div>
            <p v-if="provider === 'culture'" class="mt-3 text-xs text-(--a-muted-2)">
              The Culture API adapter interface is ready — connect a documented provider to enable testing.
            </p>
          </div>

          <!-- History -->
          <div class="glass rounded-xl p-5 shadow-card">
            <h2 class="flex items-center gap-2 font-display text-sm font-semibold text-(--a-text)">
              <History class="h-4 w-4 text-brand-300" /> Connection history
            </h2>
            <div v-if="!integration?.connectionHistory?.length" class="mt-3 text-sm text-(--a-muted-2)">No tests yet.</div>
            <ul v-else class="mt-3 space-y-2">
              <li v-for="(entry, idx) in integration.connectionHistory.slice(0, 10)" :key="idx" class="flex items-center justify-between text-xs">
                <span class="flex items-center gap-1.5" :class="entry.success ? 'text-emerald-300' : 'text-rose-300'">
                  <CheckCircle2 v-if="entry.success" class="h-3.5 w-3.5" />
                  <ShieldAlert v-else class="h-3.5 w-3.5" />
                  {{ entry.success ? 'Connected' : entry.errorCode }}
                </span>
                <span class="text-(--a-muted-2)">{{ entry.latencyMs != null ? `${entry.latencyMs}ms · ` : '' }}{{ new Date(entry.testedAt).toLocaleString() }}</span>
              </li>
            </ul>
          </div>

          <!-- Danger zone -->
          <div class="rounded-xl border border-rose-400/20 bg-rose-400/5 p-5">
            <h2 class="flex items-center gap-2 font-display text-sm font-semibold text-rose-300">
              <ShieldAlert class="h-4 w-4" /> Danger zone
            </h2>
            <div class="mt-3 space-y-3">
              <BaseButton
                v-if="integration?.configured"
                variant="outline"
                size="sm"
                @click="toggleEnabled"
              >
                {{ integration.enabled ? 'Disable Integration' : 'Enable Integration' }}
              </BaseButton>
              <BaseButton
                v-if="integration?.configured"
                variant="danger"
                size="sm"
                :disabled="deleting"
                @click="showDeleteDialog = true"
              >
                <Trash2 class="h-3.5 w-3.5" /> Delete Integration
              </BaseButton>
              <p v-else class="text-xs text-(--a-muted-2)">Configure this integration to manage it.</p>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Send test message dialog -->
    <div v-if="showSendDialog" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-night/80 backdrop-blur-sm" @click="showSendDialog = false" />
      <div class="glass-strong relative w-full max-w-md rounded-xl p-5 shadow-card">
        <h3 class="font-display text-sm font-semibold text-(--a-text)">Send Test Message?</h3>
        <p class="mt-2 text-sm text-(--a-muted)">
          This will send a test message to every configured Telegram destination
          ({{ integration?.destinations.length ?? 0 }} total).
        </p>

        <div v-if="sendResults" class="mt-3 space-y-1.5">
          <div
            v-for="(r, idx) in sendResults"
            :key="idx"
            class="flex items-center justify-between gap-2 rounded-lg bg-(--a-soft) px-3 py-2 text-xs"
            :class="r.ok ? 'text-emerald-300' : 'text-rose-300'"
          >
            <span class="flex items-center gap-1.5 font-mono">
              <CheckCircle2 v-if="r.ok" class="h-3.5 w-3.5" />
              <XCircle v-else class="h-3.5 w-3.5" />
              {{ r.chatId }}
            </span>
            <span>{{ r.ok ? (r.messageId != null ? `sent #${r.messageId}` : 'sent') : (r.errorCode ?? 'failed') }}</span>
          </div>
        </div>

        <div class="mt-4 flex justify-end gap-2">
          <BaseButton variant="ghost" @click="showSendDialog = false">Close</BaseButton>
          <BaseButton :loading="sending" @click="sendTestMessage"><Send class="h-4 w-4" /> Send Test</BaseButton>
        </div>
      </div>
    </div>

    <!-- Delete confirmation dialog -->
    <div v-if="showDeleteDialog" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-night/80 backdrop-blur-sm" @click="showDeleteDialog = false" />
      <div class="glass-strong relative w-full max-w-sm rounded-xl p-5 shadow-card">
        <h3 class="font-display text-sm font-semibold text-rose-300">Remove {{ meta.name }} Integration?</h3>
        <p class="mt-2 text-sm text-(--a-muted)">
          This will disconnect {{ meta.name }} for this organization. Connection history will remain.
        </p>
        <div class="mt-4 flex justify-end gap-2">
          <BaseButton variant="ghost" @click="showDeleteDialog = false">Cancel</BaseButton>
          <BaseButton variant="danger" :loading="deleting" @click="removeIntegration"><Trash2 class="h-4 w-4" /> Remove Integration</BaseButton>
        </div>
      </div>
    </div>
  </div>
</template>
