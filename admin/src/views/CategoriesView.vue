<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { watchDebounced } from '@vueuse/core'
import { ArrowDownWideNarrow, ExternalLink, FolderTree, Layers, Pencil, Plus, Search, Trash2 } from '@lucide/vue'
import { adminApi } from '@/api/admin.api'
import { useToast } from '@/composables/useToast'
import { errorMessage } from '@/utils/format'
import { PLATFORMS } from '@/utils/constants'
import type { Category, Platform } from '@/types/models'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import BaseSkeleton from '@/components/ui/BaseSkeleton.vue'
import BaseEmptyState from '@/components/ui/BaseEmptyState.vue'
import FormToggle from '@/components/ui/FormToggle.vue'

interface CategoryRow extends Category {
  serviceCount: number
  activeServiceCount?: number
}

const toast = useToast()
const router = useRouter()

const items = ref<CategoryRow[]>([])
const total = ref(0)
const loading = ref(true)
const saving = ref(false)
const search = ref('')
const sort = ref<'sortOrder' | 'count' | 'name'>('count')
const showEmpty = ref(false)
const page = ref(1)
const pageSize = 15

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

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))

const inactiveCount = (category: CategoryRow): number =>
  Math.max(0, (category.serviceCount ?? 0) - (category.activeServiceCount ?? 0))

function openCategoryServices(category: CategoryRow): void {
  router.push({ path: '/services', query: { category: category._id } })
}

function openCreate(): void {
  editingId.value = null
  Object.assign(form, { name: '', slug: '', platform: 'other', description: '', icon: '', sortOrder: 0, isActive: true })
  modalOpen.value = true
}

function openEdit(category: CategoryRow): void {
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
    const result = await adminApi.listCategories({
      page: page.value,
      limit: pageSize,
      search: search.value || undefined,
      status: showEmpty.value ? undefined : 'nonempty',
      sort: sort.value,
    })
    items.value = result.items
    total.value = result.total
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

async function remove(category: CategoryRow): Promise<void> {
  if (!window.confirm(`Delete category "${category.name}"?`)) return
  try {
    await adminApi.deleteCategory(category._id)
    toast.success('Category deleted')
    await load()
  } catch (err) {
    toast.error(errorMessage(err, 'Failed to delete category'))
  }
}

function goToPage(p: number): void {
  page.value = p
  void load()
}

function resetFilters(): void {
  search.value = ''
  showEmpty.value = false
  sort.value = 'count'
  page.value = 1
  void load()
}

watchDebounced([search, sort, showEmpty], () => {
  page.value = 1
  void load()
}, { debounce: 350 })

onMounted(() => void load())
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="font-display text-2xl font-bold text-(--a-text)">Categories</h1>
        <p class="mt-1 text-sm text-(--a-muted)">
          Group services by platform. Sort by service count to see what the storefront shows most.
        </p>
      </div>
      <BaseButton @click="openCreate"><Plus class="h-4 w-4" /> Add category</BaseButton>
    </div>

    <!-- Filters -->
    <div class="glass grid gap-3 rounded-2xl p-4 shadow-card sm:grid-cols-2 lg:grid-cols-4">
      <div class="relative">
        <Search class="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-(--a-muted-3)" />
        <input
          v-model="search"
          type="search"
          placeholder="Search categories…"
          class="h-11 w-full rounded-xl border border-(--a-border) bg-(--a-soft) pl-10 pr-4 text-sm text-(--a-text) placeholder:text-(--a-muted-3) focus:border-brand-400/60 focus:outline-none focus:ring-2 focus:ring-brand-400/30"
        />
      </div>

      <BaseSelect
        v-model="sort"
        label="Sort by"
        :options="[
          { value: 'count', label: 'Service count (high → low)' },
          { value: 'sortOrder', label: 'Display order' },
          { value: 'name', label: 'Name A → Z' },
        ]"
      />

      <label class="flex items-center gap-2 self-end pb-3 text-sm text-(--a-text-soft)">
        <input v-model="showEmpty" type="checkbox" class="h-4 w-4 accent-brand-500" />
        Show empty categories
      </label>

      <div class="flex items-end">
        <BaseButton variant="ghost" class="w-full" @click="resetFilters">
          <Layers class="h-4 w-4" /> Reset
        </BaseButton>
      </div>
    </div>

    <div v-if="loading" class="space-y-3">
      <BaseSkeleton v-for="n in 8" :key="n" class="h-14 w-full" />
    </div>

    <BaseEmptyState
      v-else-if="items.length === 0"
      title="No categories"
      message="Try adjusting the filters or create your first category."
    />

    <div v-else class="glass overflow-hidden rounded-2xl shadow-card">
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="border-b border-(--a-border) text-xs uppercase tracking-wider text-(--a-muted-2)">
            <tr>
              <th class="px-5 py-3 font-medium">Category</th>
              <th class="px-5 py-3 font-medium">Platform</th>
              <th class="px-5 py-3 font-medium">Slug</th>
              <th class="px-5 py-3 font-medium">Services</th>
              <th class="px-5 py-3 font-medium">Order</th>
              <th class="px-5 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-(--a-border)">
            <tr v-for="category in items" :key="category._id" class="transition-colors hover:bg-(--a-hover)">
              <td class="px-5 py-3.5">
                <p class="flex items-center gap-2 font-medium text-(--a-text)">
                  <FolderTree class="h-4 w-4 text-brand-300" /> {{ category.name }}
                  <BaseBadge v-if="!category.isActive" tone="danger" dot>Inactive</BaseBadge>
                </p>
              </td>
              <td class="px-5 py-3.5 capitalize text-(--a-muted)">{{ category.platform }}</td>
              <td class="px-5 py-3.5 text-(--a-muted-2)">{{ category.slug }}</td>
              <td class="px-5 py-3.5">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="inline-flex min-w-10 items-center gap-1.5 font-semibold text-(--a-text)">
                    <ArrowDownWideNarrow class="h-3.5 w-3.5 text-(--a-muted-3)" />
                    {{ (category.serviceCount ?? 0).toLocaleString() }}
                  </span>
                  <template v-if="(category.serviceCount ?? 0) === 0">
                    <BaseBadge tone="neutral" dot>Empty</BaseBadge>
                  </template>
                  <template v-else-if="(category.activeServiceCount ?? 0) === 0">
                    <BaseBadge tone="warning" dot>All inactive</BaseBadge>
                  </template>
                  <template v-else-if="inactiveCount(category) > 0">
                    <BaseBadge tone="warning">{{ inactiveCount(category) }} inactive</BaseBadge>
                  </template>
                </div>
              </td>
              <td class="px-5 py-3.5 text-(--a-muted)">{{ category.sortOrder }}</td>
              <td class="px-5 py-3.5">
                <div class="flex justify-end gap-2">
                  <button
                    class="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-(--a-muted) transition-colors hover:bg-brand-500/15 hover:text-brand-300"
                    title="Manage services in this category"
                    @click="openCategoryServices(category)"
                  >
                    <ExternalLink class="h-3.5 w-3.5" /> Services
                  </button>
                  <button class="flex h-8 w-8 items-center justify-center rounded-lg text-(--a-muted) hover:bg-(--a-hover) hover:text-(--a-text)" aria-label="Edit" @click="openEdit(category)">
                    <Pencil class="h-4 w-4" />
                  </button>
                  <button
                    class="flex h-8 w-8 items-center justify-center rounded-lg text-(--a-muted) hover:bg-rose-500/20 hover:text-rose-300"
                    aria-label="Delete"
                    @click="remove(category)"
                  >
                    <Trash2 class="h-4 w-4" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="totalPages > 1" class="flex items-center justify-center gap-3 pt-2">
      <button
        class="rounded-xl border border-(--a-border) px-4 py-2 text-sm text-(--a-text-soft) hover:border-brand-400/50 disabled:opacity-30"
        :disabled="page <= 1"
        @click="goToPage(page - 1)"
      >
        Prev
      </button>
      <span class="text-sm text-(--a-muted)">Page {{ page }} / {{ totalPages }}</span>
      <button
        class="rounded-xl border border-(--a-border) px-4 py-2 text-sm text-(--a-text-soft) hover:border-brand-400/50 disabled:opacity-30"
        :disabled="page >= totalPages"
        @click="goToPage(page + 1)"
      >
        Next
      </button>
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
        <BaseInput v-model.number="form.sortOrder" label="Display order (lower = first)" type="number" />
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
