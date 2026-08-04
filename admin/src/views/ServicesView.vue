<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import {
  Eye,
  EyeOff,
  Layers,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from '@lucide/vue'
import { adminApi } from '@/api/admin.api'
import { useToast } from '@/composables/useToast'
import { errorMessage, formatMoney, formatNumber } from '@/utils/format'
import { SERVICE_TYPES } from '@/utils/constants'
import type { Category, Service, ServiceType } from '@/types/models'
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

const items = ref<Service[]>([])
const categories = ref<Category[]>([])
const total = ref(0)
const loading = ref(true)
const saving = ref(false)
const search = ref('')
const categoryFilter = ref('')
const statusFilter = ref('')
const page = ref(1)
const pageSize = 10

// Bulk selection
const selected = ref<Set<string>>(new Set())
const bulkBusy = ref(false)

const modalOpen = ref(false)
const editingId = ref<string | null>(null)
const form = reactive({
  name: '',
  type: 'Default',
  categoryId: '',
  description: '',
  pricePerUnit: '',
  min: '',
  max: '',
  deliveryTime: '',
  provider: 'smmwiz',
  refill: false,
  cancel: false,
  isActive: true,
  isFeatured: false,
  sortOrder: '',
})

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))

const selectedCount = computed(() => selected.value.size)
const allChecked = computed(
  () => items.value.length > 0 && items.value.every((s) => selected.value.has(s._id)),
)

function toggleAll(): void {
  if (allChecked.value) {
    selected.value = new Set()
  } else {
    selected.value = new Set(items.value.map((s) => s._id))
  }
}

function toggleOne(id: string): void {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}

function openCreate(): void {
  editingId.value = null
  Object.assign(form, {
    name: '',
    type: 'Default',
    categoryId: categories.value[0]?._id ?? '',
    description: '',
    pricePerUnit: '',
    min: '',
    max: '',
    deliveryTime: '',
    provider: 'smmwiz',
    refill: false,
    cancel: false,
    isActive: true,
    isFeatured: false,
    sortOrder: '',
  })
  modalOpen.value = true
}

function openEdit(service: Service): void {
  editingId.value = service._id
  Object.assign(form, {
    name: service.name,
    type: service.type,
    categoryId: service.category && typeof service.category === 'object' ? service.category._id : (service.category ?? ''),
    description: service.description,
    pricePerUnit: String(service.pricePerUnit),
    min: String(service.min),
    max: String(service.max),
    deliveryTime: service.deliveryTime,
    provider: service.provider,
    refill: service.refill,
    cancel: service.cancel,
    isActive: service.isActive,
    isFeatured: service.isFeatured,
    sortOrder: String(service.sortOrder),
  })
  modalOpen.value = true
}

async function load(): Promise<void> {
  loading.value = true
  try {
    const result = await adminApi.listServices({
      page: page.value,
      limit: pageSize,
      search: search.value || undefined,
      category: categoryFilter.value || undefined,
      status: statusFilter.value || undefined,
    })
    items.value = result.items
    total.value = result.total
    // Drop selections that are no longer on this page.
    const ids = new Set(result.items.map((s) => s._id))
    selected.value = new Set([...selected.value].filter((id) => ids.has(id)))
  } catch (err) {
    toast.error(errorMessage(err, 'Failed to load services'))
  } finally {
    loading.value = false
  }
}

async function save(): Promise<void> {
  if (!form.name.trim()) {
    toast.warning('Service name is required')
    return
  }
  saving.value = true
  const payload = {
    name: form.name.trim(),
    type: form.type as ServiceType,
    categoryId: form.categoryId || undefined,
    description: form.description,
    pricePerUnit: Number(form.pricePerUnit) || 0,
    min: Number(form.min) || 0,
    max: Number(form.max) || 0,
    deliveryTime: form.deliveryTime,
    provider: form.provider,
    refill: form.refill,
    cancel: form.cancel,
    isActive: form.isActive,
    isFeatured: form.isFeatured,
    sortOrder: Number(form.sortOrder) || 0,
  }
  try {
    if (editingId.value) {
      await adminApi.updateService(editingId.value, payload)
      toast.success('Service updated')
    } else {
      await adminApi.createService(payload)
      toast.success('Service created')
    }
    modalOpen.value = false
    await load()
  } catch (err) {
    toast.error(errorMessage(err, 'Failed to save service'))
  } finally {
    saving.value = false
  }
}

async function remove(service: Service): Promise<void> {
  if (!window.confirm(`Delete "${service.name}"? This cannot be undone.`)) return
  try {
    await adminApi.deleteService(service._id)
    toast.success('Service deleted')
    await load()
  } catch (err) {
    toast.error(errorMessage(err, 'Failed to delete service'))
  }
}

// Quick per-row toggles ------------------------------------------------------

async function toggleActive(service: Service): Promise<void> {
  try {
    await adminApi.updateService(service._id, { isActive: !service.isActive })
    toast.success(service.isActive ? 'Hidden from storefront' : 'Service is now visible')
    await load()
  } catch (err) {
    toast.error(errorMessage(err, 'Failed to update service'))
  }
}

async function toggleFeatured(service: Service): Promise<void> {
  try {
    await adminApi.updateService(service._id, { isFeatured: !service.isFeatured })
    toast.success(service.isFeatured ? 'Removed from featured' : 'Marked as featured')
    await load()
  } catch (err) {
    toast.error(errorMessage(err, 'Failed to update service'))
  }
}

// Bulk curation --------------------------------------------------------------

async function bulkUpdate(data: { isActive?: boolean; isFeatured?: boolean }, verb: string): Promise<void> {
  if (selectedCount.value === 0) {
    toast.warning('Select at least one service first')
    return
  }
  bulkBusy.value = true
  try {
    const res = await adminApi.bulkUpdateServices([...selected.value], data)
    toast.success(`${verb}: ${res.updated} service${res.updated === 1 ? '' : 's'} updated`)
    selected.value = new Set()
    await load()
  } catch (err) {
    toast.error(errorMessage(err, 'Bulk update failed'))
  } finally {
    bulkBusy.value = false
  }
}

function goToPage(p: number): void {
  page.value = p
  void load()
}

function resetFilters(): void {
  search.value = ''
  categoryFilter.value = ''
  statusFilter.value = ''
  page.value = 1
  void load()
}

onMounted(async () => {
  try {
    categories.value = await adminApi.listCategories({ limit: 500 }).then((r) => r.items)
  } catch {
    categories.value = []
  }
  await load()
})
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="font-display text-2xl font-bold text-(--a-text)">Services</h1>
        <p class="mt-1 text-sm text-(--a-muted)">Manage the catalog, edit product text and curate what customers see.</p>
      </div>
      <BaseButton @click="openCreate"><Plus class="h-4 w-4" /> Add service</BaseButton>
    </div>

    <!-- Filters -->
    <div class="glass grid gap-3 rounded-2xl p-4 shadow-card sm:grid-cols-2 lg:grid-cols-4">
      <div class="relative">
        <Search class="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-(--a-muted-3)" />
        <input
          v-model="search"
          type="search"
          placeholder="Search services…"
          class="h-11 w-full rounded-xl border border-(--a-border) bg-(--a-soft) pl-10 pr-4 text-sm text-(--a-text) placeholder:text-(--a-muted-3) focus:border-brand-400/60 focus:outline-none focus:ring-2 focus:ring-brand-400/30"
          @keyup.enter="page = 1; void load()"
        />
      </div>

      <BaseSelect
        v-model="categoryFilter"
        label="Category"
        :options="[{ value: '', label: 'All categories' }, ...categories.map((c) => ({ value: c._id, label: c.name }))]"
        @update:model-value="page = 1; void load()"
      />

      <BaseSelect
        v-model="statusFilter"
        label="Status"
        :options="[
          { value: '', label: 'All statuses' },
          { value: 'active', label: 'Visible' },
          { value: 'inactive', label: 'Hidden' },
          { value: 'featured', label: 'Featured' },
        ]"
        @update:model-value="page = 1; void load()"
      />

      <div class="flex items-end">
        <BaseButton variant="ghost" class="w-full" @click="resetFilters">
          <Layers class="h-4 w-4" /> Reset
        </BaseButton>
      </div>
    </div>

    <!-- Bulk curation toolbar -->
    <div
      v-if="selectedCount > 0"
      class="flex flex-wrap items-center gap-3 rounded-2xl border border-brand-400/40 bg-brand-500/10 px-4 py-3 shadow-glow"
    >
      <span class="text-sm font-semibold text-(--a-text)">
        {{ selectedCount }} selected
      </span>
      <div class="ml-auto flex flex-wrap gap-2">
        <BaseButton size="sm" variant="ghost" :loading="bulkBusy" @click="bulkUpdate({ isActive: true }, 'Shown')">
          <Eye class="h-4 w-4" /> Show
        </BaseButton>
        <BaseButton size="sm" variant="ghost" :loading="bulkBusy" @click="bulkUpdate({ isActive: false }, 'Hidden')">
          <EyeOff class="h-4 w-4" /> Hide
        </BaseButton>
        <BaseButton size="sm" variant="ghost" :loading="bulkBusy" @click="bulkUpdate({ isFeatured: true }, 'Featured')">
          <Sparkles class="h-4 w-4" /> Feature
        </BaseButton>
        <BaseButton size="sm" variant="ghost" :loading="bulkBusy" @click="bulkUpdate({ isFeatured: false }, 'Unfeatured')">
          Unfeature
        </BaseButton>
      </div>
    </div>

    <div v-if="loading" class="space-y-3">
      <BaseSkeleton v-for="n in 6" :key="n" class="h-16 w-full" />
    </div>

    <BaseEmptyState
      v-else-if="items.length === 0"
      title="No services"
      message="Try adjusting the filters or sync the provider catalogue from the dashboard."
    />

    <div v-else class="glass overflow-hidden rounded-2xl shadow-card">
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="border-b border-(--a-border) text-xs uppercase tracking-wider text-(--a-muted-2)">
            <tr>
              <th class="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  class="h-4 w-4 accent-brand-500"
                  :checked="allChecked"
                  @change="toggleAll"
                />
              </th>
              <th class="px-4 py-3 font-medium">Service</th>
              <th class="px-4 py-3 font-medium">Type</th>
              <th class="px-4 py-3 font-medium">Price / 1k</th>
              <th class="px-4 py-3 font-medium">Range</th>
              <th class="px-4 py-3 font-medium">Flags</th>
              <th class="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-(--a-border)">
            <tr
              v-for="service in items"
              :key="service._id"
              class="transition-colors hover:bg-(--a-hover)"
              :class="!service.isActive ? 'opacity-60' : ''"
            >
              <td class="px-4 py-3.5">
                <input
                  type="checkbox"
                  class="h-4 w-4 accent-brand-500"
                  :checked="selected.has(service._id)"
                  @change="toggleOne(service._id)"
                />
              </td>
              <td class="px-4 py-3.5">
                <p class="font-medium text-(--a-text)">{{ service.name }}</p>
                <p class="text-xs text-(--a-muted-2)">
                  {{ service.category && typeof service.category === 'object' ? service.category.name : '—' }}
                  <span v-if="service.description" class="ml-1">· {{ service.description }}</span>
                </p>
              </td>
              <td class="px-4 py-3.5 text-(--a-muted)">{{ service.type }}</td>
              <td class="px-4 py-3.5 font-semibold text-(--a-text)">{{ formatMoney(service.pricePerUnit * 1000) }}</td>
              <td class="px-4 py-3.5 text-(--a-muted)">{{ formatNumber(service.min) }}–{{ formatNumber(service.max) }}</td>
              <td class="px-4 py-3.5">
                <div class="flex flex-wrap gap-1.5">
                  <BaseBadge v-if="!service.isActive" tone="danger" dot>Hidden</BaseBadge>
                  <BaseBadge v-if="service.refill" tone="success" dot>Refill</BaseBadge>
                  <BaseBadge v-if="service.cancel" tone="info" dot>Cancel</BaseBadge>
                  <BaseBadge v-if="service.isFeatured" tone="brand">Featured</BaseBadge>
                </div>
              </td>
              <td class="px-4 py-3.5">
                <div class="flex justify-end gap-1">
                  <button
                    class="flex h-8 w-8 items-center justify-center rounded-lg text-(--a-muted) transition-colors hover:bg-(--a-hover) hover:text-(--a-text)"
                    :title="service.isActive ? 'Hide from storefront' : 'Show in storefront'"
                    :aria-label="service.isActive ? 'Hide service' : 'Show service'"
                    @click="toggleActive(service)"
                  >
                    <EyeOff v-if="service.isActive" class="h-4 w-4" />
                    <Eye v-else class="h-4 w-4 text-emerald-300" />
                  </button>
                  <button
                    class="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-(--a-hover)"
                    :class="service.isFeatured ? 'text-amber-300' : 'text-(--a-muted)'"
                    :title="service.isFeatured ? 'Remove from featured' : 'Mark as featured'"
                    :aria-label="service.isFeatured ? 'Unfeature service' : 'Feature service'"
                    @click="toggleFeatured(service)"
                  >
                    <Sparkles class="h-4 w-4" />
                  </button>
                  <button
                    class="flex h-8 w-8 items-center justify-center rounded-lg text-(--a-muted) transition-colors hover:bg-(--a-hover) hover:text-(--a-text)"
                    aria-label="Edit"
                    @click="openEdit(service)"
                  >
                    <Pencil class="h-4 w-4" />
                  </button>
                  <button
                    class="flex h-8 w-8 items-center justify-center rounded-lg text-(--a-muted) transition-colors hover:bg-rose-500/20 hover:text-rose-300"
                    aria-label="Delete"
                    @click="remove(service)"
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

    <!-- Create / edit modal -->
    <BaseModal :open="modalOpen" :title="editingId ? 'Edit service' : 'Add service'" :max-width="'max-w-2xl'" @close="modalOpen = false">
      <div class="space-y-4">
        <div class="grid gap-4 sm:grid-cols-2">
          <BaseInput v-model="form.name" label="Name" placeholder="e.g. TikTok Followers" />
          <BaseSelect
            v-model="form.type"
            label="Type"
            :options="SERVICE_TYPES.map((t) => ({ value: t, label: t }))"
          />
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <BaseSelect
            v-model="form.categoryId"
            label="Category"
            :options="categories.map((c) => ({ value: c._id, label: c.name }))"
          />
          <BaseInput v-model="form.provider" label="Provider" placeholder="smmwiz | manual" />
        </div>
        <div class="grid gap-4 sm:grid-cols-3">
          <BaseInput v-model="form.pricePerUnit" label="Price / unit" type="number" min="0" step="0.0001" />
          <BaseInput v-model="form.min" label="Min" type="number" min="0" />
          <BaseInput v-model="form.max" label="Max" type="number" min="0" />
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <BaseInput v-model="form.deliveryTime" label="Delivery time" placeholder="e.g. 0–30 min" />
          <BaseInput v-model="form.sortOrder" label="Sort order" type="number" />
        </div>
        <BaseTextarea v-model="form.description" label="Description" rows="3" />
        <div class="grid gap-3 sm:grid-cols-2">
          <FormToggle v-model="form.refill" label="Refillable" />
          <FormToggle v-model="form.cancel" label="Cancellable" />
          <FormToggle v-model="form.isActive" label="Visible on storefront" />
          <FormToggle v-model="form.isFeatured" label="Featured" />
        </div>
        <div class="flex justify-end gap-3 pt-2">
          <BaseButton variant="ghost" @click="modalOpen = false">Cancel</BaseButton>
          <BaseButton :loading="saving" @click="save">Save service</BaseButton>
        </div>
      </div>
    </BaseModal>
  </div>
</template>
