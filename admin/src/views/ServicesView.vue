<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  CheckSquare,
  Eye,
  EyeOff,
  Layers,
  Pencil,
  Percent,
  Plus,
  Search,
  Sparkles,
  Trash2,
  TrendingUp,
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
const route = useRoute()
const router = useRouter()

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

// Bulk selection (ids toolbar) -------------------------------------------------
const selected = ref<Set<string>>(new Set())
const bulkBusy = ref(false)

// Bulk profit percentage modal --------------------------------------------------
const profitModalOpen = ref(false)
const profitTargetMode = ref<'selected' | 'category'>('selected')
const profitInput = ref<number | string>(20)
const profitBusy = ref(false)

function openProfitModal(mode: 'selected' | 'category'): void {
  profitTargetMode.value = mode
  profitInput.value = 20
  profitModalOpen.value = true
}

async function applyProfitModal(): Promise<void> {
  const pct = Number(profitInput.value)
  if (isNaN(pct) || pct < 0) {
    toast.warning('Enter a valid non-negative profit percentage')
    return
  }
  profitBusy.value = true
  try {
    if (profitTargetMode.value === 'selected') {
      if (selectedCount.value === 0) return
      const res = await adminApi.bulkSetServiceProfit({
        ids: [...selected.value],
        profitPercentage: pct,
      })
      toast.success(`Set ${pct}% profit on ${res.updated} selected service${res.updated === 1 ? '' : 's'}`)
      selected.value = new Set()
    } else if (profitTargetMode.value === 'category' && selectedCategory.value) {
      const res = await adminApi.bulkSetServiceProfit({
        categoryId: selectedCategory.value._id,
        profitPercentage: pct,
      })
      toast.success(`Set ${pct}% profit on ${res.updated} service${res.updated === 1 ? '' : 's'} in “${selectedCategory.value.name}”`)
    }
    profitModalOpen.value = false
    await load()
  } catch (err) {
    toast.error(errorMessage(err, 'Failed to update profit percentage'))
  } finally {
    profitBusy.value = false
  }
}

// Category curation (enable/disable every service in the filtered category) ----
const confirmOpen = ref(false)
const pendingAction = ref<{
  label: string
  detail: string
  isActive: boolean
} | null>(null)
const categoryActing = ref(false)

const modalOpen = ref(false)
const editingId = ref<string | null>(null)
const form = reactive({
  name: '',
  type: 'Default',
  categoryId: '',
  description: '',
  providerRate: '',
  profitPercentage: '0',
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

function onProfitMarkupChange(): void {
  const rate = Number(form.providerRate) || 0
  const pct = Number(form.profitPercentage) || 0
  form.pricePerUnit = (rate * (1 + pct / 100)).toFixed(4)
}

function onSellingPriceChange(): void {
  const rate = Number(form.providerRate) || 0
  const selling = Number(form.pricePerUnit) || 0
  if (rate > 0 && selling >= 0) {
    const pct = ((selling - rate) / rate) * 100
    form.profitPercentage = pct.toFixed(2)
  }
}

function onProviderRateChange(): void {
  onProfitMarkupChange()
}

const computedSellingRate = computed(() => {
  return (Number(form.pricePerUnit) || 0).toFixed(4)
})

const computedProfitMargin = computed(() => {
  const rate = Number(form.providerRate) || 0
  const selling = Number(form.pricePerUnit) || 0
  return Math.max(0, selling - rate).toFixed(4)
})

const computedProfitMarginPct = computed(() => {
  const selling = Number(form.pricePerUnit) || 0
  const profit = Number(computedProfitMargin.value) || 0
  if (!selling) return '0.0'
  return ((profit / selling) * 100).toFixed(1)
})

const summaryAvgProviderCost = computed(() => {
  if (!items.value.length) return 0
  const totalCost = items.value.reduce((acc, s) => acc + (s.providerRate ?? s.pricePerUnit), 0)
  return totalCost / items.value.length
})

const summaryAvgSellingPrice = computed(() => {
  if (!items.value.length) return 0
  const totalSelling = items.value.reduce((acc, s) => acc + s.pricePerUnit, 0)
  return totalSelling / items.value.length
})

const summaryAvgProfitPer1k = computed(() => {
  return Math.max(0, summaryAvgSellingPrice.value - summaryAvgProviderCost.value)
})

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
const selectedCount = computed(() => selected.value.size)
const allChecked = computed(
  () => items.value.length > 0 && items.value.every((s) => selected.value.has(s._id)),
)
const selectedCategory = computed<Category | null>(
  () => categories.value.find((c) => c._id === categoryFilter.value) ?? null,
)
const isCategoryFiltered = computed(() => categoryFilter.value !== '')
const pageInactiveCount = computed(() => items.value.filter((s) => !s.isActive).length)

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
    providerRate: '',
    profitPercentage: '0',
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
  const pRate = service.providerRate ?? service.pricePerUnit
  const pPct = service.profitPercentage ?? 0
  Object.assign(form, {
    name: service.name,
    type: service.type,
    categoryId: service.category && typeof service.category === 'object' ? service.category._id : (service.category ?? ''),
    description: service.description,
    providerRate: String(pRate),
    profitPercentage: String(pPct),
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
  const providerRate = Number(form.providerRate) || Number(form.pricePerUnit) || 0
  const profitPercentage = Number(form.profitPercentage) || 0
  const calculatedPrice = Number(computedSellingRate.value) || Number(form.pricePerUnit) || 0

  const payload = {
    name: form.name.trim(),
    type: form.type as ServiceType,
    categoryId: form.categoryId || undefined,
    description: form.description,
    providerRate,
    profitPercentage,
    pricePerUnit: calculatedPrice,
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

// Per-row toggles ---------------------------------------------------------------

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

// Bulk curation (by ids — toolbar) ---------------------------------------------

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

// Category curation (enable/disable every service in the filtered category) -----

function requestBulkByCategory(isActive: boolean): void {
  if (!selectedCategory.value) return
  const name = selectedCategory.value.name
  pendingAction.value = {
    label: isActive ? 'Enable all' : 'Disable all',
    detail: `Every service in “${name}”${isActive ? '' : ' — currently active ones only'}`,
    isActive,
  }
  confirmOpen.value = true
}

async function runCategoryBulk(): Promise<void> {
  const action = pendingAction.value
  if (!action || !selectedCategory.value) return
  categoryActing.value = true
  try {
    const result = await adminApi.bulkSetServiceStatus({
      categoryId: selectedCategory.value._id,
      isActive: action.isActive,
    })
    toast.success(
      `${action.label}ed ${result.updated} service${result.updated === 1 ? '' : 's'}`,
    )
    confirmOpen.value = false
    pendingAction.value = null
    await load()
  } catch (err) {
    toast.error(errorMessage(err, 'Category update failed'))
  } finally {
    categoryActing.value = false
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
  // Support deep links from the Categories page: /services?category=<id>
  const fromQuery = typeof route.query.category === 'string' ? route.query.category : ''
  if (fromQuery) {
    categoryFilter.value = fromQuery // still pass through; backend will filter
  }
  await load()
})
</script>

<template>
  <div class="w-full space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="font-display text-xl font-bold text-(--a-text)">Services</h1>
        <p class="mt-1 text-sm text-(--a-muted)">
          Manage the catalog — edit product text, mark featured and curate what customers see. ({{ total }} services)
        </p>
      </div>
      <div class="flex gap-2">
        <BaseButton variant="outline" @click="router.push('/categories')">
          <Layers class="h-4 w-4" /> Categories
        </BaseButton>
        <BaseButton @click="openCreate"><Plus class="h-4 w-4" /> Add service</BaseButton>
      </div>
    </div>

    <!-- Price Comparison & Profit Analytics Summary Cards -->
    <div v-if="!loading && items.length > 0" class="grid gap-3.5 sm:grid-cols-3">
      <div class="glass rounded-xl p-3.5 shadow-card border border-(--a-border)">
        <div class="flex items-center justify-between text-xs text-(--a-muted)">
          <span>Avg Provider Cost / 1k</span>
          <span class="rounded bg-sky-500/10 px-2 py-0.5 text-[11px] font-semibold text-sky-300">Original Cost</span>
        </div>
        <p class="mt-1 font-mono text-lg font-bold text-(--a-text)">{{ formatMoney(summaryAvgProviderCost) }}</p>
        <p class="text-[11px] text-(--a-muted-2)">Original supplier rate from WizSMM</p>
      </div>

      <div class="glass rounded-xl p-3.5 shadow-card border border-(--a-border)">
        <div class="flex items-center justify-between text-xs text-(--a-muted)">
          <span>Avg Selling Price / 1k</span>
          <span class="rounded bg-brand-500/10 px-2 py-0.5 text-[11px] font-semibold text-brand-300">With Profit</span>
        </div>
        <p class="mt-1 font-mono text-lg font-bold text-(--a-text)">{{ formatMoney(summaryAvgSellingPrice) }}</p>
        <p class="text-[11px] text-(--a-muted-2)">Storefront customer rate</p>
      </div>

      <div class="glass rounded-xl p-3.5 shadow-card border border-emerald-500/30 bg-emerald-500/5">
        <div class="flex items-center justify-between text-xs text-emerald-400">
          <span class="font-medium">Avg Net Profit / 1k</span>
          <span class="rounded bg-emerald-500/20 px-2 py-0.5 text-[11px] font-bold text-emerald-300">Margin</span>
        </div>
        <p class="mt-1 font-mono text-lg font-bold text-emerald-400">+{{ formatMoney(summaryAvgProfitPer1k) }}</p>
        <p class="text-[11px] text-emerald-300/80">Average admin profit earned per 1k</p>
      </div>
    </div>

    <!-- Filters -->
    <div class="glass grid gap-3 rounded-2xl p-4 shadow-card sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <label class="block text-xs font-medium text-(--a-muted-2) mb-1.5">Search</label>
        <div class="relative">
          <Search class="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-(--a-muted-3)" />
          <input
            v-model="search"
            type="search"
            placeholder="Search services…"
            class="h-9.5 w-full rounded-lg border border-(--a-border) bg-(--a-soft) pl-9 pr-3.5 text-sm text-(--a-text) placeholder:text-(--a-muted-3) focus:border-brand-400/60 focus:outline-none focus:ring-2 focus:ring-brand-400/30"
            @keyup.enter="page = 1; void load()"
          />
        </div>
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

    <!-- Bulk curation toolbar (selected ids: show/hide/feature/set profit) -->
    <div
      v-if="selectedCount > 0"
      class="flex flex-wrap items-center gap-3 rounded-2xl border border-brand-400/40 bg-brand-500/10 px-4 py-3 shadow-glow"
    >
      <span class="flex items-center gap-2 text-sm font-semibold text-(--a-text)">
        <CheckSquare class="h-4 w-4 text-brand-300" /> {{ selectedCount }} selected
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
        <BaseButton size="sm" variant="outline" @click="openProfitModal('selected')">
          <Percent class="h-4 w-4" /> Set Profit %
        </BaseButton>
        <button
          class="ml-1 text-xs font-medium text-(--a-muted) transition-colors hover:text-(--a-text)"
          @click="selected = new Set()"
        >
          Clear
        </button>
      </div>
    </div>

    <!-- Category curation bar (enable/disable/profit every service in the filtered category) -->
    <div
      v-if="isCategoryFiltered"
      class="glass-strong flex flex-wrap items-center gap-3 rounded-2xl border-brand-400/30 p-3 shadow-card"
    >
      <Layers class="h-4 w-4 text-brand-300" />
      <span class="text-sm font-semibold text-(--a-text)">
        Filtered: {{ selectedCategory?.name ?? 'this category' }}
      </span>
      <span class="mx-1 hidden h-5 w-px bg-(--a-border) sm:block" />
      <BaseButton size="sm" variant="outline" :disabled="categoryActing" @click="requestBulkByCategory(true)">
        Enable all in category
      </BaseButton>
      <BaseButton size="sm" variant="danger" :disabled="categoryActing" @click="requestBulkByCategory(false)">
        Disable all in category
      </BaseButton>
      <BaseButton size="sm" variant="ghost" @click="openProfitModal('category')">
        <TrendingUp class="h-4 w-4" /> Set Profit % for category
      </BaseButton>
      <span class="text-xs text-(--a-muted-2)">
        ~{{ total }} services · {{ pageInactiveCount }} inactive on this page
      </span>
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
              <th class="px-4 py-3 font-medium">Original Cost / 1k</th>
              <th class="px-4 py-3 font-medium">Markup %</th>
              <th class="px-4 py-3 font-medium">Selling Price / 1k</th>
              <th class="px-4 py-3 font-medium">Net Profit / 1k</th>
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
              <td class="px-4 py-3.5 text-(--a-muted)">
                <span class="font-mono text-sm">{{ formatMoney(service.providerRate ?? service.pricePerUnit) }}</span>
              </td>
              <td class="px-4 py-3.5">
                <BaseBadge tone="success" dot>+{{ service.profitPercentage ?? 0 }}%</BaseBadge>
              </td>
              <td class="px-4 py-3.5">
                <span class="font-mono text-sm font-semibold text-(--a-text)">{{ formatMoney(service.pricePerUnit) }}</span>
              </td>
              <td class="px-4 py-3.5">
                <div class="flex flex-col">
                  <span class="font-mono text-sm font-semibold text-emerald-400">
                    +{{ formatMoney(Math.max(0, service.pricePerUnit - (service.providerRate ?? service.pricePerUnit))) }}
                  </span>
                  <span class="text-[10px] text-emerald-400/80">
                    ({{ service.pricePerUnit > 0 ? (((Math.max(0, service.pricePerUnit - (service.providerRate ?? service.pricePerUnit))) / service.pricePerUnit) * 100).toFixed(1) : 0 }}% margin)
                  </span>
                </div>
              </td>
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
                  <button class="flex h-8 w-8 items-center justify-center rounded-lg text-(--a-muted) transition-colors hover:bg-(--a-hover) hover:text-(--a-text)" aria-label="Edit" @click="openEdit(service)">
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

    <!-- Category bulk confirm modal -->
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
          <BaseButton variant="ghost" :disabled="categoryActing" @click="confirmOpen = false">Cancel</BaseButton>
          <BaseButton :variant="pendingAction?.isActive ? 'primary' : 'danger'" :loading="categoryActing" @click="runCategoryBulk">
            {{ pendingAction?.label }} now
          </BaseButton>
        </div>
      </div>
    </BaseModal>

    <!-- Bulk Profit Percentage Modal -->
    <BaseModal
      :open="profitModalOpen"
      :title="profitTargetMode === 'selected' ? `Set profit % for ${selectedCount} services` : `Set profit % for category “${selectedCategory?.name ?? ''}”`"
      @close="profitModalOpen = false"
    >
      <div class="space-y-4">
        <p class="text-sm text-(--a-muted)">
          Update the admin profit percentage markup for all
          <strong class="text-(--a-text)">
            {{ profitTargetMode === 'selected' ? `${selectedCount} selected services` : `services in category “${selectedCategory?.name ?? ''}”` }}
          </strong>.
          Selling price will be automatically recalculated (`Price = Provider Cost * (1 + Profit% / 100)`).
        </p>
        <BaseInput v-model="profitInput" label="Profit Markup (%)" type="number" min="0" step="1" placeholder="e.g. 20 for 20%" />
        <div class="flex justify-end gap-3 pt-2">
          <BaseButton variant="ghost" :disabled="profitBusy" @click="profitModalOpen = false">Cancel</BaseButton>
          <BaseButton :loading="profitBusy" @click="applyProfitModal">Apply Profit Percentage</BaseButton>
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
          <BaseSelect
            v-model="form.provider"
            label="Provider"
            :options="[
              { value: 'smmwiz', label: 'SmmWiz' },
              { value: 'manual', label: 'Manual' },
            ]"
          />
        </div>

        <!-- Price & Profit Comparison Breakdown -->
        <div class="rounded-xl border border-brand-400/30 bg-brand-500/5 p-4 space-y-3">
          <div class="flex items-center justify-between border-b border-brand-400/20 pb-2">
            <span class="text-xs font-semibold uppercase tracking-wider text-brand-300 flex items-center gap-1.5">
              <TrendingUp class="h-3.5 w-3.5" /> Price & Profit Settings
            </span>
            <span class="text-xs text-(--a-muted-2)">Calculated per 1,000 units</span>
          </div>
          <div class="grid gap-3 sm:grid-cols-3">
            <BaseInput
              v-model="form.providerRate"
              label="Provider Cost / 1k ($)"
              type="number"
              min="0"
              step="0.0001"
              placeholder="0.04"
              @input="onProviderRateChange"
            />
            <BaseInput
              v-model="form.profitPercentage"
              label="Profit Markup (%)"
              type="number"
              step="0.1"
              placeholder="15"
              @input="onProfitMarkupChange"
            />
            <BaseInput
              v-model="form.pricePerUnit"
              label="Fixed Price / 1k ($)"
              type="number"
              min="0"
              step="0.0001"
              placeholder="0.05"
              @input="onSellingPriceChange"
            />
          </div>
          <div class="grid grid-cols-3 gap-3 rounded-lg border border-(--a-border) bg-(--a-soft) p-3 text-xs">
            <div class="space-y-0.5">
              <span class="text-(--a-muted) block text-[11px]">Original Cost / 1k</span>
              <p class="font-mono text-sm font-semibold text-(--a-text)">${{ (Number(form.providerRate) || 0).toFixed(4) }}</p>
            </div>
            <div class="space-y-0.5 border-l border-(--a-border) pl-3">
              <span class="text-(--a-muted) block text-[11px]">Fixed Customer Selling Price</span>
              <p class="font-mono text-sm font-bold text-brand-300">${{ computedSellingRate }}</p>
            </div>
            <div class="space-y-0.5 border-l border-(--a-border) pl-3">
              <span class="text-emerald-400 block text-[11px]">Net Profit / 1k</span>
              <p class="font-mono text-sm font-bold text-emerald-400">+${{ computedProfitMargin }} <span class="text-[10px] font-normal text-emerald-300/80">({{ computedProfitMarginPct }}%)</span></p>
            </div>
          </div>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
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
