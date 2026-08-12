<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { Plus, Settings as SettingsIcon } from '@lucide/vue'
import { adminApi } from '@/api/admin.api'
import { useToast } from '@/composables/useToast'
import { errorMessage } from '@/utils/format'
import type { Setting } from '@/types/models'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseTextarea from '@/components/ui/BaseTextarea.vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import BaseSkeleton from '@/components/ui/BaseSkeleton.vue'
import BaseEmptyState from '@/components/ui/BaseEmptyState.vue'

const toast = useToast()

const items = ref<Setting[]>([])
const loading = ref(true)
const saving = ref(false)
const modalOpen = ref(false)
const editingKey = ref<string | null>(null)

const form = reactive({
  key: '',
  value: '',
  description: '',
})

function openCreate(): void {
  editingKey.value = null
  Object.assign(form, { key: '', value: '', description: '' })
  modalOpen.value = true
}

function openEdit(setting: Setting): void {
  editingKey.value = setting.key
  Object.assign(form, {
    key: setting.key,
    value: typeof setting.value === 'string' ? setting.value : JSON.stringify(setting.value, null, 2),
    description: setting.description,
  })
  modalOpen.value = true
}

function displayValue(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

async function load(): Promise<void> {
  loading.value = true
  try {
    items.value = await adminApi.listSettings()
  } catch (err) {
    toast.error(errorMessage(err, 'Failed to load settings'))
  } finally {
    loading.value = false
  }
}

async function save(): Promise<void> {
  if (!form.key.trim()) {
    toast.warning('Key is required')
    return
  }
  saving.value = true
  let parsed: unknown = form.value
  try {
    parsed = JSON.parse(form.value)
  } catch {
    // Keep the raw string when it's not valid JSON.
  }
  try {
    await adminApi.setSetting({
      key: form.key.trim(),
      value: parsed,
      description: form.description,
    })
    toast.success('Setting saved')
    modalOpen.value = false
    await load()
  } catch (err) {
    toast.error(errorMessage(err, 'Failed to save setting'))
  } finally {
    saving.value = false
  }
}

onMounted(() => void load())
</script>

<template>
  <div class="mx-auto w-full max-w-3xl space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="font-display text-xl font-bold text-(--a-text)">Settings</h1>
        <p class="mt-1 text-sm text-(--a-muted)">
          Platform key/value settings. Secrets (like the SMM API key) should stay in backend
          environment variables.
        </p>
      </div>
      <BaseButton @click="openCreate"><Plus class="h-4 w-4" /> Add setting</BaseButton>
    </div>

    <div v-if="loading" class="space-y-3">
      <BaseSkeleton v-for="n in 4" :key="n" class="h-16 w-full" />
    </div>

    <BaseEmptyState v-else-if="items.length === 0" title="No settings" message="Add platform settings to get started." />

    <div v-else class="glass divide-y divide-(--a-border) overflow-hidden rounded-2xl shadow-card">
      <button
        v-for="setting in items"
        :key="setting.key"
        class="flex w-full items-start justify-between gap-4 px-6 py-4 text-left transition-colors hover:bg-(--a-hover)"
        @click="openEdit(setting)"
      >
        <div class="min-w-0">
          <p class="flex items-center gap-2 font-medium text-(--a-text)">
            <SettingsIcon class="h-4 w-4 text-brand-300" /> {{ setting.key }}
          </p>
          <p v-if="setting.description" class="mt-0.5 text-xs text-(--a-muted-2)">{{ setting.description }}</p>
        </div>
        <code class="max-w-[40%] truncate rounded-lg bg-(--a-soft) px-2.5 py-1 text-xs text-(--a-muted)">
          {{ displayValue(setting.value) }}
        </code>
      </button>
    </div>

    <BaseModal :open="modalOpen" :title="editingKey ? `Edit ${editingKey}` : 'Add setting'" @close="modalOpen = false">
      <div class="space-y-4">
        <BaseInput v-model="form.key" label="Key" placeholder="e.g. site_name" :disabled="!!editingKey" />
        <BaseTextarea v-model="form.value" label="Value" rows="3" hint="Strings are stored as-is. Use JSON for objects/numbers." />
        <BaseInput v-model="form.description" label="Description (optional)" />
        <div class="flex justify-end gap-3 pt-2">
          <BaseButton variant="ghost" @click="modalOpen = false">Cancel</BaseButton>
          <BaseButton :loading="saving" @click="save">Save setting</BaseButton>
        </div>
      </div>
    </BaseModal>
  </div>
</template>
