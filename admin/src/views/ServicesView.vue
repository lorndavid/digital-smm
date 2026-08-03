<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CheckSquare, Layers, Pencil, Plus, Power, Search, Square, Trash2 } from '@lucide/vue'
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
const route = useRoute()
const router = useRouter()

const items = ref<Service[]>([])
const categories = ref<Category[]>([])
const total = ref(0)
const loading = ref(true)
const saving = ref(false)
const search = ref('')
const categoryFilter = ref('all')
const page = ref(1)
const pageSize = 10

// ---------------------------------------------------------------------------
// Bulk curation state
// ---------------------------------------------------------------------------
const selectedIds = ref<Set<string>>(new Set())
const bulkActing = ref(false)
const confirmOpen = ref(false)
const pendingAction = ref<{
  label: string
  detail: string
  isActive: boolean
  scope: 'ids' | 'category'
} | null>(null)

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

const selectedCategory = computed<Category | null>(
  () => categories.value.find((c) => c._id === categoryFilter.value) ?? null,
)

const allOnPageSelected = computed(
  () => items.value.length > 0 && items.value.every((s) => selectedIds.value.has(s._id)),
)

const pageInactiveCount = computed(() => items.value.filter((s) => !s.isActive).length)


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
      category: categoryFilter.value === 'all' ? undefined : categoryFilter.value,
    })
    items.value = result.items
    total.value = result.total
    // Drop selections that are no longer on the page.
    const valid = new Set(items.value.map((s) => s._id))
    selectedIds.value = new Set([...selectedIds.value].filter((id) => valid.has(id)))
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

// ---------------------------------------------------------------------------
// Bulk curation
// ---------------------------------------------------------------------------

function toggleRow(id: string): void {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
}

function toggleAllOnPage(): void {
  if (allOnPageSelected.value) {
    const next = new Set(selectedIds.value)
    for (const s of items.value) next.delete(s._id)
    selectedIds.value = next
  } else {
    const next = new Set(selectedIds.value)
    for (const s of items.value) next.add(s._id)
    selectedIds.value = next
  }
}

function requestBulk(ids: string[], isActive: boolean): void {
  pendingAction.value = {
    label: isActive ? 'Enable' : 'Disable',
    detail: `${ids.length} selected service${ids.length === 1 ? '' : 's'}`,
    isActive,
    scope: 'ids',
  }
  confirmOpen.value = true
}

function requestBulkByCategory(isActive: boolean): void {
  if (!selectedCategory.value) return
  const name = selectedCategory.value.name
  pendingAction.value = {
    label: isActive ? 'Enable all' : 'Disable all',
    detail: `Every service in “${name}”${isActive ? '' : ' — currently active ones only'}`,
    isActive,
    scope: 'category',
  }
  confirmOpen.value = true
}

async function runBulk(): Promise<void> {
  const action = pendingAction.value
  if (!action) return
  bulkActing.value = true
  try {
    const payload: { ids?: string[]; categoryId?: string; isActive: boolean } = {
      isActive: action.isActive,
    }
    if (action.scope === 'category') {
      payload.categoryId = selectedCategory.value?._id
    } else {
      payload.ids = [...selectedIds.value]
    }
    const result = await adminApi.bulkUpdateServices(payload)
    toast.success(
      `${action.label}ed ${result.updated} service${result.updated === 1 ? '' : 's'}`,
    )
    selectedIds.value = new Set()
    confirmOpen.value = false
    pendingAction.value = null
    await load()
  } catch (err) {
    toast.error(errorMessage(err, 'Bulk update failed'))
  } finally {
    bulkActing.value = false
  }
}

// Reload whenever the category filter changes (watcher is more robust than
// relying on the select's event bubbling through the component boundary).
watch(categoryFilter, () => {
  page.value = 1
  selectedIds.value = new Set()
  void load()
})

function goToPage(p: number): void {
  page.value = p
  void load()
}

onMounted(async () => {
  try {
    categories.value = await adminApi.listCategories()
  } catch {
    categories.value = []
  }
  // Support deep links from the Categories page: /services?category=<id>
  const fromQuery = typeof route.query.category === 'string' ? route.query.category : ''
  if (fromQuery && categories.value.some((c) => c._id === fromQuery)) {
    categoryFilter.value = fromQuery
  } else if (fromQuery) {
    categoryFilter.value = fromQuery // still pass through; backend will filter
  }
  await load()
})
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="font-display text-2xl font-bold text-(--a-text)">Services</h1>
        <p class="mt-1 text-sm text-(--a-muted)">
          Manage the catalog — bulk enable/disable by category to curate what customers see. ({{ total }} services)
        </p>
      </div>
      <div class="flex gap-2">
        <BaseButton variant="outline" @click="router.push('/categories')">
          <Layers class="h-4 w-4" /> Categories
        </BaseButton>
        <BaseButton @click="openCreate"><Plus class="h-4 w-4" /> Add service</BaseButton>
      </div>
    </div>

    <!-- Filters -->
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div class="relative flex-1">
        <Search class="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-(--a-muted-3)" />
        <input
          v-model="search"
          type="search"
          placeholder="Search services…"
          class="h-11 w-full rounded-xl border border-(--a-border) bg-(--a-soft) pl-10 pr-4 text-sm text-(--a-text) placeholder:text-(--a-muted-3) focus:border-brand-400/60 focus:outline-none focus:ring-2 focus:ring-brand-400/30"
          @keyup.enter="page = 1; void load()"
        />
      </div>
      <div class="sm:w-72">
        <BaseSelect
          v-model="categoryFilter"
          :options="[{ value: 'all', label: 'All categories' }, ...categories.map((c) => ({ value: c._id, label: c.name }))]"
        />
      </div>
    </div>

    <!-- Bulk action bar -->
    <div
      v-if="selectedIds.size > 0 || (selectedCategory && categoryFilter !== 'all')"
      class="glass-strong flex flex-wrap items-center gap-3 rounded-2xl border-brand-400/30 p-3 shadow-card"
    >
      <CheckSquare class="h-4 w-4 text-brand-300" />
      <span class="text-sm font-semibold text-(--a-text)">
        {{ selectedIds.size > 0 ? `${selectedIds.size} selected` : `Filtered: ${selectedCategory?.name}` }}
      </span>
      <span class="mx-1 hidden h-5 w-px bg-(--a-border) sm:block" />
      <template v-if="selectedIds.size > 0">
        <BaseButton size="sm" variant="outline" :disabled="bulkActing" @click="requestBulk([...selectedIds], true)">
          Enable selected
        </BaseButton>
        <BaseButton size="sm" variant="danger" :disabled="bulkActing" @click="requestBulk([...selectedIds], false)">
          Disable selected
        </BaseButton>
      </template>
      <template v-if="selectedCategory && categoryFilter !== 'all'">
        <span class="mx-1 hidden h-5 w-px bg-(--a-border) sm:block" />
        <BaseButton size="sm" variant="outline" :disabled="bulkActing" @click="requestBulkByCategory(true)">
          Enable all in category
        </BaseButton>
        <BaseButton size="sm" variant="danger" :disabled="bulkActing" @click="requestBulkByCategory(false)">
          Disable all in category
        </BaseButton>
        <span class="text-xs text-(--a-muted-2)">
          ~{{ total }} services · {{ pageInactiveCount }} inactive on this page
        </span>
      </template>
      <button
        v-if="selectedIds.size > 0"
        class="ml-auto text-xs font-medium text-(--a-muted) transition-colors hover:text-(--a-text)"
        @click="selectedIds = new Set()"
      >
        Clear selection
      </button>
    </div>

    <div v-if="loading" class="space-y-3">
      <BaseSkeleton v-for="n in 6" :key="n" class="h-16 w-full" />
    </div>

    <BaseEmptyState v-else-if="items.length === 0" title="No services" message="Add a service, sync the provider catalogue, or pick a different category filter." />

    <div v-else class="glass overflow-hidden rounded-2xl shadow-card">
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="border-b border-(--a-border) text-xs uppercase tracking-wider text-(--a-muted-2)">
            <tr>
              <th class="w-12 px-4 py-3">
                <button
                  class="flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-(--a-hover)"
                  :aria-label="allOnPageSelected ? 'Deselect all on page' : 'Select all on page'"
                  @click="toggleAllOnPage"
                >
                  <Square v-if="!allOnPageSelected" class="h-4 w-4" />
                  <CheckSquare v-else class="h-4 w-4 text-brand-300" />
                </button>
              </th>
              <th class="px-5 py-3 font-medium">Service</th>
              <th class="px-5 py-3 font-medium">Type</th>
              <th class="px-5 py-3 font-medium">Price / 1k</th>
              <th class="px-5 py-3 font-medium">Range</th>
              <th class="px-5 py-3 font-medium">Status</th>
              <th class="px-5 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-(--a-border)">
            <tr
              v-for="service in items"
              :key="service._id"
              class="transition-colors"
              :class="selectedIds.has(service._id) ? 'bg-brand-500/[0.07]' : 'hover:bg-(--a-hover)'"
            >
              <td class="px-4 py-3.5">
                <button
                  class="flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-(--a-hover)"
                  :aria-label="selectedIds.has(service._id) ? 'Deselect' : 'Select'"
                  @click="toggleRow(service._id)"
                >
                  <Square v-if="!selectedIds.has(service._id)" class="h-4 w-4 text-(--a-muted-3)" />
                  <CheckSquare v-else class="h-4 w-4 text-brand-300" />
                </button>
              </td>
              <td class="px-5 py-3.5">
                <p class="font-medium text-(--a-text)">{{ service.name }}</p>
                <p class="text-xs text-(--a-muted-2)">
                  {{ service.category && typeof service.category === 'object' ? service.category.name : '—' }}
                </p>
              </td>
              <td class="px-5 py-3.5 text-(--a-muted)">{{ service.type }}</td>
              <td class="px-5 py-3.5 font-semibold text-(--a-text)">{{ formatMoney(service.pricePerUnit * 1000) }}</td>
              <td class="px-5 py-3.5 text-(--a-muted)">{{ formatNumber(service.min) }}–{{ formatNumber(service.max) }}</td>
              <td class="px-5 py-3.5">
                <BaseBadge :tone="service.isActive ? 'success' : 'neutral'" dot>
                  {{ service.isActive ? 'Active' : 'Inactive' }}
                </BaseBadge>
              </td>
              <td class="px-5 py-3.5">
                <div class="flex justify-end gap-2">
                  <button
                    class="flex h-8 w-8 items-center justify-center rounded-lg text-(--a-muted) transition-colors hover:bg-(--a-hover) hover:text-(--a-text)"
                    aria-label="Toggle active"
                    :title="service.isActive ? 'Disable' : 'Enable'"
                    @click="requestBulk([service._id], !service.isActive)"
                  >
                    <Power class="h-4 w-4" />
                  </button>
                  <button class="flex h-8 w-8 items-center justify-center rounded-lg text-(--a-muted) transition-colors hover:bg-(--a-hover) hover:text-(--a-text)" aria-label="Edit" @click="openEdit(service)">
                    <Pencil class="h-4 w-4" />
                  </button>
                  <button class="flex h-8 w-8 items-center justify-center rounded-lg text-(--a-muted) transition-colors hover:bg-rose-500/20 hover:text-rose-300" aria-label="Delete" @click="remove(service)">
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
      <button class="rounded-xl border border-(--a-border) px-4 py-2 text-sm text-(--a-text-soft) hover:border-brand-400/50 disabled:opacity-30" :disabled="page <= 1" @click="goToPage(page - 1)">Prev</button>
      <span class="text-sm text-(--a-muted)">Page {{ page }} / {{ totalPages }}</span>
      <button class="rounded-xl border border-(--a-border) px-4 py-2 text-sm text-(--a-text-soft) hover:border-brand-400/50 disabled:opacity-30" :disabled="page >= totalPages" @click="goToPage(page + 1)">Next</button>
    </div>

    <!-- Bulk confirm modal -->
    <BaseModal :open="confirmOpen" :title="`${pendingAction?.label ?? ''} services?`" @close="confirmOpen = false">
      <div class="space-y-4">
        <p class="text-sm text-(--a-muted)">
          This will <strong class="text-(--a-text)">{{ pendingAction?.label.toLowerCase() }}</strong>
          {{ pendingAction?.detail }}.
          <span v-if="pendingAction && !pendingAction.isActive" class="mt-1 block text-xs text-amber-300">
            Disabled services disappear from the customer storefront immediately. Existing orders are not affected.
          </span>
        </p>
        <div class="flex justify-end gap-3 pt-2">
          <BaseButton variant="ghost" :disabled="bulkActing" @click="confirmOpen = false">Cancel</BaseButton>
          <BaseButton :variant="pendingAction?.isActive ? 'primary' : 'danger'" :loading="bulkActing" @click="runBulk">
            {{ pendingAction?.label }} now
          </BaseButton>
        </div>
      </div>
    </BaseModal>

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
          <FormToggle v-model="form.isActive" label="Active" />
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
