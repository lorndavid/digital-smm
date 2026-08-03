<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { FolderTree, Pencil, Plus, Trash2 } from '@lucide/vue'
import { adminApi } from '@/api/admin.api'
import { useToast } from '@/composables/useToast'
import { errorMessage } from '@/utils/format'
import { PLATFORMS } from '@/utils/constants'
import type { Category, Platform } from '@/types/models'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import BaseSkeleton from '@/components/ui/BaseSkeleton.vue'
import BaseEmptyState from '@/components/ui/BaseEmptyState.vue'
import FormToggle from '@/components/ui/FormToggle.vue'

const toast = useToast()

const items = ref<Category[]>([])
const loading = ref(true)
const saving = ref(false)
const modalOpen = ref(false)
const editingId = ref<string | null>(null)

const form = reactive({
  name: '',
  slug: '',
  platform: 'other',
  description: '',
  icon: '',
  sortOrder: 0,
  isActive: true,
})

function openCreate(): void {
  editingId.value = null
  Object.assign(form, { name: '', slug: '', platform: 'other', description: '', icon: '', sortOrder: 0, isActive: true })
  modalOpen.value = true
}

function openEdit(category: Category): void {
  editingId.value = category._id
  Object.assign(form, {
    name: category.name,
    slug: category.slug,
    platform: category.platform,
    description: category.description,
    icon: category.icon,
    sortOrder: category.sortOrder,
    isActive: category.isActive,
  })
  modalOpen.value = true
}

async function load(): Promise<void> {
  loading.value = true
  try {
    items.value = await adminApi.listCategories()
  } catch (err) {
    toast.error(errorMessage(err, 'Failed to load categories'))
  } finally {
    loading.value = false
  }
}

async function save(): Promise<void> {
  if (!form.name.trim()) {
    toast.warning('Category name is required')
    return
  }
  saving.value = true
  const payload = {
    name: form.name.trim(),
    slug: form.slug || undefined,
    platform: form.platform as Platform,
    description: form.description,
    icon: form.icon,
    sortOrder: Number(form.sortOrder) || 0,
    isActive: form.isActive,
  }
  try {
    if (editingId.value) {
      await adminApi.updateCategory(editingId.value, payload)
      toast.success('Category updated')
    } else {
      await adminApi.createCategory(payload)
      toast.success('Category created')
    }
    modalOpen.value = false
    await load()
  } catch (err) {
    toast.error(errorMessage(err, 'Failed to save category'))
  } finally {
    saving.value = false
  }
}

async function remove(category: Category): Promise<void> {
  if (!window.confirm(`Delete category "${category.name}"?`)) return
  try {
    await adminApi.deleteCategory(category._id)
    toast.success('Category deleted')
    await load()
  } catch (err) {
    toast.error(errorMessage(err, 'Failed to delete category'))
  }
}

onMounted(() => void load())
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="font-display text-2xl font-bold text-(--a-text)">Categories</h1>
        <p class="mt-1 text-sm text-(--a-muted)">Group services by platform.</p>
      </div>
      <BaseButton @click="openCreate"><Plus class="h-4 w-4" /> Add category</BaseButton>
    </div>

    <div v-if="loading" class="space-y-3">
      <BaseSkeleton v-for="n in 4" :key="n" class="h-16 w-full" />
    </div>

    <BaseEmptyState v-else-if="items.length === 0" title="No categories" message="Create your first category to group services." />

    <div v-else class="glass overflow-hidden rounded-2xl shadow-card">
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="border-b border-(--a-border) text-xs uppercase tracking-wider text-(--a-muted-2)">
            <tr>
              <th class="px-5 py-3 font-medium">Category</th>
              <th class="px-5 py-3 font-medium">Platform</th>
              <th class="px-5 py-3 font-medium">Slug</th>
              <th class="px-5 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-(--a-border)">
            <tr v-for="category in items" :key="category._id" class="transition-colors hover:bg-(--a-hover)">
              <td class="px-5 py-3.5">
                <p class="flex items-center gap-2 font-medium text-(--a-text)">
                  <FolderTree class="h-4 w-4 text-brand-300" /> {{ category.name }}
                  <span v-if="!category.isActive" class="text-xs text-rose-300">· inactive</span>
                </p>
              </td>
              <td class="px-5 py-3.5 capitalize text-(--a-muted)">{{ category.platform }}</td>
              <td class="px-5 py-3.5 text-(--a-muted-2)">{{ category.slug }}</td>
              <td class="px-5 py-3.5">
                <div class="flex justify-end gap-2">
                  <button class="flex h-8 w-8 items-center justify-center rounded-lg text-(--a-muted) hover:bg-(--a-hover) hover:text-(--a-text)" aria-label="Edit" @click="openEdit(category)">
                    <Pencil class="h-4 w-4" />
                  </button>
                  <button class="flex h-8 w-8 items-center justify-center rounded-lg text-(--a-muted) hover:bg-rose-500/20 hover:text-rose-300" aria-label="Delete" @click="remove(category)">
                    <Trash2 class="h-4 w-4" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <BaseModal :open="modalOpen" :title="editingId ? 'Edit category' : 'Add category'" @close="modalOpen = false">
      <div class="space-y-4">
        <div class="grid gap-4 sm:grid-cols-2">
          <BaseInput v-model="form.name" label="Name" placeholder="e.g. TikTok" />
          <BaseInput v-model="form.slug" label="Slug (optional)" placeholder="tiktok" hint="Auto-generated from name if empty." />
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <BaseSelect v-model="form.platform" label="Platform" :options="PLATFORMS.map((p) => ({ value: p.value, label: p.label }))" />
          <BaseInput v-model="form.icon" label="Icon (lucide name)" placeholder="e.g. Music2" />
        </div>
        <BaseInput v-model.number="form.sortOrder" label="Sort order" type="number" />
        <BaseInput v-model="form.description" label="Description" placeholder="Short description" />
        <FormToggle v-model="form.isActive" label="Active" />
        <div class="flex justify-end gap-3 pt-2">
          <BaseButton variant="ghost" @click="modalOpen = false">Cancel</BaseButton>
          <BaseButton :loading="saving" @click="save">Save category</BaseButton>
        </div>
      </div>
    </BaseModal>
  </div>
</template>
