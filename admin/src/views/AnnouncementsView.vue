<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { Megaphone, Pencil, Plus, Trash2 } from '@lucide/vue'
import { adminApi } from '@/api/admin.api'
import { useToast } from '@/composables/useToast'
import { errorMessage, formatDate } from '@/utils/format'
import type { Announcement, AnnouncementType } from '@/types/models'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import BaseTextarea from '@/components/ui/BaseTextarea.vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import BaseSkeleton from '@/components/ui/BaseSkeleton.vue'
import BaseEmptyState from '@/components/ui/BaseEmptyState.vue'
import FormToggle from '@/components/ui/FormToggle.vue'

const toast = useToast()

const items = ref<Announcement[]>([])
const total = ref(0)
const loading = ref(true)
const saving = ref(false)
const page = ref(1)
const pageSize = 10
const modalOpen = ref(false)
const editingId = ref<string | null>(null)

const form = reactive({
  title: '',
  body: '',
  type: 'info',
  isActive: true,
  expiresAt: '',
})

const typeTone: Record<string, 'info' | 'success' | 'warning' | 'danger'> = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  critical: 'danger',
}

function openCreate(): void {
  editingId.value = null
  Object.assign(form, { title: '', body: '', type: 'info', isActive: true, expiresAt: '' })
  modalOpen.value = true
}

function openEdit(announcement: Announcement): void {
  editingId.value = announcement._id
  Object.assign(form, {
    title: announcement.title,
    body: announcement.body,
    type: announcement.type,
    isActive: announcement.isActive,
    expiresAt: announcement.expiresAt ? announcement.expiresAt.slice(0, 16) : '',
  })
  modalOpen.value = true
}

async function load(): Promise<void> {
  loading.value = true
  try {
    const result = await adminApi.listAnnouncements({ page: page.value, limit: pageSize })
    items.value = result.items
    total.value = result.total
  } catch (err) {
    toast.error(errorMessage(err, 'Failed to load announcements'))
  } finally {
    loading.value = false
  }
}

async function save(): Promise<void> {
  if (!form.title.trim()) {
    toast.warning('Title is required')
    return
  }
  saving.value = true
  const payload = {
    title: form.title.trim(),
    body: form.body,
    type: form.type as AnnouncementType,
    isActive: form.isActive,
    expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
  }
  try {
    if (editingId.value) {
      await adminApi.updateAnnouncement(editingId.value, payload)
      toast.success('Announcement updated')
    } else {
      await adminApi.createAnnouncement(payload)
      toast.success('Announcement created')
    }
    modalOpen.value = false
    await load()
  } catch (err) {
    toast.error(errorMessage(err, 'Failed to save announcement'))
  } finally {
    saving.value = false
  }
}

async function remove(announcement: Announcement): Promise<void> {
  if (!window.confirm(`Delete announcement "${announcement.title}"?`)) return
  try {
    await adminApi.deleteAnnouncement(announcement._id)
    toast.success('Announcement deleted')
    await load()
  } catch (err) {
    toast.error(errorMessage(err, 'Failed to delete announcement'))
  }
}

onMounted(() => void load())
</script>

<template>
  <div class="w-full space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="font-display text-xl font-bold text-(--a-text)">Announcements</h1>
        <p class="mt-1 text-sm text-(--a-muted)">Publish notices shown on the customer dashboard.</p>
      </div>
      <BaseButton @click="openCreate"><Plus class="h-4 w-4" /> New announcement</BaseButton>
    </div>

    <div v-if="loading" class="space-y-3">
      <BaseSkeleton v-for="n in 4" :key="n" class="h-20 w-full" />
    </div>

    <BaseEmptyState v-else-if="items.length === 0" title="No announcements" message="Create an announcement to notify your customers." />

    <div v-else class="space-y-3">
      <div v-for="announcement in items" :key="announcement._id" class="glass flex flex-col gap-3 rounded-2xl p-5 shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div class="flex items-start gap-3">
          <div class="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-300">
            <Megaphone class="h-5 w-5" />
          </div>
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <p class="font-medium text-(--a-text)">{{ announcement.title }}</p>
              <BaseBadge :tone="typeTone[announcement.type] ?? 'info'">{{ announcement.type }}</BaseBadge>
              <BaseBadge :tone="announcement.isActive ? 'success' : 'neutral'" dot>
                {{ announcement.isActive ? 'Active' : 'Draft' }}
              </BaseBadge>
            </div>
            <p v-if="announcement.body" class="mt-1 text-sm text-(--a-muted)">{{ announcement.body }}</p>
            <p class="mt-1 text-xs text-(--a-muted-3)">{{ formatDate(announcement.createdAt) }}</p>
          </div>
        </div>
        <div class="flex shrink-0 gap-2">
          <button class="flex h-8 w-8 items-center justify-center rounded-lg text-(--a-muted) hover:bg-(--a-hover) hover:text-(--a-text)" aria-label="Edit" @click="openEdit(announcement)">
            <Pencil class="h-4 w-4" />
          </button>
          <button class="flex h-8 w-8 items-center justify-center rounded-lg text-(--a-muted) hover:bg-rose-500/20 hover:text-rose-300" aria-label="Delete" @click="remove(announcement)">
            <Trash2 class="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>

    <BaseModal :open="modalOpen" :title="editingId ? 'Edit announcement' : 'New announcement'" @close="modalOpen = false">
      <div class="space-y-4">
        <BaseInput v-model="form.title" label="Title" placeholder="e.g. New service drop 🎉" />
        <BaseTextarea v-model="form.body" label="Message" rows="4" />
        <div class="grid gap-4 sm:grid-cols-2">
          <BaseSelect
            v-model="form.type"
            label="Type"
            :options="[
              { value: 'info', label: 'Info' },
              { value: 'success', label: 'Success' },
              { value: 'warning', label: 'Warning' },
              { value: 'critical', label: 'Critical' },
            ]"
          />
          <BaseInput v-model="form.expiresAt" label="Expires at (optional)" type="datetime-local" />
        </div>
        <FormToggle v-model="form.isActive" label="Active" />
        <div class="flex justify-end gap-3 pt-2">
          <BaseButton variant="ghost" @click="modalOpen = false">Cancel</BaseButton>
          <BaseButton :loading="saving" @click="save">Save announcement</BaseButton>
        </div>
      </div>
    </BaseModal>
  </div>
</template>
