<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  ArrowLeft,
  ArrowUpDown,
  Check,
  ChevronDown,
  Layers,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  X,
} from '@lucide/vue'
import { watchDebounced } from '@vueuse/core'
import { useServicesStore } from '@/stores/services.store'
import ServiceCard from '@/components/dashboard/ServiceCard.vue'
import BuyServiceModal from '@/components/dashboard/BuyServiceModal.vue'
import PlatformIcon from '@/components/ui/PlatformIcon.vue'
import BasePagination from '@/components/ui/BasePagination.vue'
import BaseSkeleton from '@/components/ui/BaseSkeleton.vue'
import BaseEmptyState from '@/components/ui/BaseEmptyState.vue'
import type { Category, Service } from '@/types/models'
import type { ServiceSort } from '@/api/services.api'
import { PLATFORM_META, SERVICE_TYPE_LABEL } from '@/utils/constants'
import { formatMoney } from '@/utils/format'
import { groupServices, type ServiceGroup } from '@/utils/serviceGroups'

const store = useServicesStore()

const page = ref(1)
const search = ref('')
const sort = ref<'recommended' | ServiceSort>('recommended')

// ---- Filters ---------------------------------------------------------------
const minPrice = ref('')
const maxPrice = ref('')
const serviceType = ref('')
const onlyRefill = ref(false)
const onlyCancel = ref(false)
const onlyFeatured = ref(false)
const showFilters = ref(false)
const showMore = ref(false)

const buyingService = ref<Service | null>(null)
const buyOpen = ref(false)

const PAGE_SIZE = 12
/** Whole platforms are fetched in one request (backend caps at 1,000). */
const PLATFORM_FETCH_LIMIT = 1000
/** "All groups" view caps each group's cards; "Show more" expands a group. */
const GROUP_CARD_CAP = 12

// ---------------------------------------------------------------------------
// Curated platforms for the Cambodia market: the platforms Cambodian users
// actually grow on are shown first. Each chip maps to a keyword that matches
// EVERY category whose name contains it (SMMWiz splits platforms across many
// category names), so clicking "Facebook" shows all Facebook services.
// ---------------------------------------------------------------------------

const MAIN_PLATFORMS = [
  { keyword: 'facebook', label: 'Facebook' },
  { keyword: 'tiktok', label: 'TikTok' },
  { keyword: 'telegram', label: 'Telegram' },
  { keyword: 'youtube', label: 'YouTube' },
  { keyword: 'instagram', label: 'Instagram' },
] as const

const activePlatform = ref('')

// ---- Platform mode state ---------------------------------------------------
/** The full (unfiltered) service list of the active platform. */
const platformAll = ref<Service[]>([])
/** Selected subcategory chip; 'all' shows every group as sections. */
const activeSubcategory = ref('all')
/** Groups the user expanded past the per-group card cap. */
const expandedGroups = ref<Set<string>>(new Set())

const platformMode = computed(() => activePlatform.value !== '')

const otherCategories = computed<Category[]>(() => {
  const mainKeywords = MAIN_PLATFORMS.map((p) => p.keyword)
  return store.categories.filter((c) => {
    const name = c.name.trim().toLowerCase()
    return !mainKeywords.some((kw) => name.includes(kw))
  })
})

const sortOptions: Array<{ value: 'recommended' | ServiceSort; label: string }> = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'price_asc', label: 'Price: low → high' },
  { value: 'price_desc', label: 'Price: high → low' },
  { value: 'name_asc', label: 'Name A → Z' },
  { value: 'newest', label: 'Newest first' },
]

// Popular service types shown as quick chips in the filter panel.
const TYPE_CHIPS = ['Default', 'Custom Comments', 'Mentions', 'Subscriptions', 'Web Traffic'] as const

const activeFilterCount = computed(() => {
  let n = 0
  if (minPrice.value) n += 1
  if (maxPrice.value) n += 1
  if (serviceType.value) n += 1
  if (onlyRefill.value) n += 1
  if (onlyCancel.value) n += 1
  if (onlyFeatured.value) n += 1
  return n
})

const hasFilters = computed(
  () =>
    activeFilterCount.value > 0 ||
    !!search.value.trim() ||
    store.activeCategory !== 'all' ||
    activePlatform.value !== '' ||
    activeSubcategory.value !== 'all',
)

const activePlatformMeta = computed(() => {
  const p = MAIN_PLATFORMS.find((m) => m.keyword === activePlatform.value)
  if (!p) return null
  return { ...p, ...PLATFORM_META[p.keyword as keyof typeof PLATFORM_META] }
})

function clearFilters(): void {
  minPrice.value = ''
  maxPrice.value = ''
  serviceType.value = ''
  onlyRefill.value = false
  onlyCancel.value = false
  onlyFeatured.value = false
  search.value = ''
  activePlatform.value = ''
  activeSubcategory.value = 'all'
  platformAll.value = []
  store.selectCategory('all')
  page.value = 1
  void load()
}

/**
 * Filter-panel "Reset filters": clears only search/price/type/toggles and
 * KEEPS the active platform + subcategory (client-side filters recompute
 * instantly; server mode reloads).
 */
function resetFilters(): void {
  minPrice.value = ''
  maxPrice.value = ''
  serviceType.value = ''
  onlyRefill.value = false
  onlyCancel.value = false
  onlyFeatured.value = false
  search.value = ''
  if (!platformMode.value) {
    page.value = 1
    void load()
  }
}

// ---------------------------------------------------------------------------
// Server-side mode (search, other categories, pagination)
// ---------------------------------------------------------------------------

async function load(): Promise<void> {
  const min = Number(minPrice.value)
  const max = Number(maxPrice.value)
  await store.fetchServices({
    category:
      !activePlatform.value && store.activeCategory !== 'all'
        ? store.activeCategory
        : undefined,
    search: search.value.trim() || undefined,
    sort: sort.value === 'recommended' ? undefined : sort.value,
    // pricePerUnit is already the rate per 1,000 — the filter inputs are
    // entered in the same unit, so pass them through unchanged.
    minPrice: minPrice.value && Number.isFinite(min) ? min : undefined,
    maxPrice: maxPrice.value && Number.isFinite(max) ? max : undefined,
    type: serviceType.value || undefined,
    refill: onlyRefill.value || undefined,
    cancel: onlyCancel.value || undefined,
    featured: onlyFeatured.value || undefined,
    page: page.value,
    limit: PAGE_SIZE,
  })
}

// ---------------------------------------------------------------------------
// Platform mode (grouped subcategories, filters applied client-side)
// ---------------------------------------------------------------------------

/** Fetches the whole platform once; filters/sort/grouping are client-side. */
async function loadPlatform(): Promise<void> {
  store.services = []
  store.total = 0
  expandedGroups.value = new Set()
  await store.fetchServices({
    platform: activePlatform.value,
    limit: PLATFORM_FETCH_LIMIT,
  })
  platformAll.value = store.services
}

/** Client-side filter + sort over the full platform set. */
const platformFiltered = computed<Service[]>(() => {
  const q = search.value.trim().toLowerCase()
  const min = Number(minPrice.value)
  const max = Number(maxPrice.value)

  let list = platformAll.value.filter((s) => {
    if (q && !s.name.toLowerCase().includes(q)) return false
    if (serviceType.value && s.type !== serviceType.value) return false
    if (onlyRefill.value && !s.refill) return false
    if (onlyCancel.value && !s.cancel) return false
    if (onlyFeatured.value && !s.isFeatured) return false
    if (minPrice.value && Number.isFinite(min) && s.pricePerUnit < min) return false
    if (maxPrice.value && Number.isFinite(max) && s.pricePerUnit > max) return false
    return true
  })

  // The server already returned the platform in "recommended" order — any
  // other sort is applied here so switching never needs another request.
  if (sort.value === 'price_asc') list = [...list].sort((a, b) => a.pricePerUnit - b.pricePerUnit)
  else if (sort.value === 'price_desc') list = [...list].sort((a, b) => b.pricePerUnit - a.pricePerUnit)
  else if (sort.value === 'name_asc') list = [...list].sort((a, b) => a.name.localeCompare(b.name))
  else if (sort.value === 'newest') {
    list = [...list].sort(
      (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
    )
  }
  return list
})

/** Subcategory buckets of the filtered platform services. */
const groups = computed<ServiceGroup[]>(() =>
  groupServices(platformFiltered.value, activePlatform.value),
)

const activeGroup = computed<ServiceGroup | null>(
  () => groups.value.find((g) => g.key === activeSubcategory.value) ?? null,
)

function visibleServices(group: ServiceGroup): Service[] {
  return expandedGroups.value.has(group.key)
    ? group.services
    : group.services.slice(0, GROUP_CARD_CAP)
}

function toggleExpand(group: ServiceGroup): void {
  const next = new Set(expandedGroups.value)
  if (next.has(group.key)) next.delete(group.key)
  else next.add(group.key)
  expandedGroups.value = next
}

function selectSubcategory(key: string): void {
  activeSubcategory.value = key
  expandedGroups.value = new Set()
}

// ---------------------------------------------------------------------------
// Chips / navigation
// ---------------------------------------------------------------------------

/** Clicking a main platform chip filters by keyword (all matching categories). */
function selectPlatform(keyword: string): void {
  activePlatform.value = activePlatform.value === keyword ? '' : keyword
  store.selectCategory('all')
  page.value = 1
  activeSubcategory.value = 'all'
  if (activePlatform.value) void loadPlatform()
  else void load()
}

/** "All" chip: keep search/price/type filters, only clear the platform chip. */
function selectAll(): void {
  activePlatform.value = ''
  activeSubcategory.value = 'all'
  platformAll.value = []
  store.selectCategory('all')
  page.value = 1
  void load()
}

function selectCategory(categoryId: string): void {
  activePlatform.value = ''
  activeSubcategory.value = 'all'
  platformAll.value = []
  store.selectCategory(categoryId)
  page.value = 1
  showMore.value = false
  void load()
}

/** Curated view hides categories whose services were all disabled by admins. */
async function onToggleCurated(): Promise<void> {
  await store.setCuratedOnly(!store.curatedOnly)
  page.value = 1
  showMore.value = false
  void load()
}

function changeSort(): void {
  // In platform mode sorting is client-side — the computed handles it.
  if (platformMode.value) return
  page.value = 1
  void load()
}

watchDebounced(
  [search, minPrice, maxPrice, serviceType, onlyRefill, onlyCancel, onlyFeatured],
  () => {
    if (platformMode.value) return // client-side filtering
    page.value = 1
    void load()
  },
  { debounce: 350 },
)

// Reset per-group expansion whenever the underlying platform data changes.
watch([platformAll, activeSubcategory], () => {
  expandedGroups.value = new Set()
})

function openBuy(service: Service): void {
  buyingService.value = service
  buyOpen.value = true
}

onMounted(async () => {
  await store.fetchCategories()
  await load()
})
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6">
    <!-- Header -->
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="font-display text-2xl font-bold text-white">Explore Services</h1>
        <p class="mt-1 text-sm text-white/50">
          Choose a platform, pick a service and grow in minutes.
        </p>
        <!-- No-markup promise: prices are the exact SMMWiz provider rates. -->
        <p class="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
          <ShieldCheck class="h-3.5 w-3.5" />
          Prices are SMMWiz's exact rates — no markup.
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <!-- Sort -->
        <label class="relative flex items-center">
          <ArrowUpDown class="pointer-events-none absolute left-3 h-4 w-4 text-white/35" />
          <select
            v-model="sort"
            class="h-11 appearance-none rounded-xl border border-white/10 bg-white/5 pl-10 pr-9 text-sm text-white [&>option]:bg-night focus:border-brand-400/60 focus:outline-none focus:ring-2 focus:ring-brand-400/30"
            @change="changeSort"
          >
            <option v-for="opt in sortOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
          <ChevronDown class="pointer-events-none absolute right-3 h-4 w-4 text-white/40" />
        </label>

        <!-- Filters toggle -->
        <button
          class="relative flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-medium transition-all"
          :class="
            showFilters || activeFilterCount > 0
              ? 'border-brand-400/60 bg-brand-500/15 text-white'
              : 'border-white/10 bg-white/5 text-white/70 hover:border-brand-400/40 hover:text-white'
          "
          @click="showFilters = !showFilters"
        >
          <SlidersHorizontal class="h-4 w-4" />
          Filters
          <span
            v-if="activeFilterCount > 0"
            class="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1.5 text-xs font-bold text-white"
          >
            {{ activeFilterCount }}
          </span>
        </button>

        <!-- Clear all -->
        <button
          v-if="hasFilters"
          class="flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-white/50 transition-colors hover:bg-white/5 hover:text-white"
          @click="clearFilters"
        >
          <RotateCcw class="h-3.5 w-3.5" /> Clear
        </button>
      </div>
    </div>

    <!-- Search + categories -->
    <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div class="relative w-full lg:max-w-xs">
        <Search class="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
        <input
          v-model="search"
          type="search"
          placeholder="Search services…"
          class="h-11 w-full rounded-xl border border-white/10 bg-white/5 pl-10 pr-4 text-sm text-white placeholder:text-white/30 transition-colors focus:border-brand-400/60 focus:outline-none focus:ring-2 focus:ring-brand-400/30"
        />
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button
          class="shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-all"
          :class="
            store.activeCategory === 'all' && activePlatform === ''
              ? 'bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-glow'
              : 'glass text-white/60 hover:text-white'
          "
          @click="selectAll"
        >
          All
        </button>

        <!-- Main Cambodia platforms first: each chip = whole platform -->
        <button
          v-for="platform in MAIN_PLATFORMS"
          :key="platform.keyword"
          class="flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-all"
          :class="
            activePlatform === platform.keyword
              ? 'bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-glow'
              : 'glass text-white/60 hover:text-white'
          "
          @click="selectPlatform(platform.keyword)"
        >
          <PlatformIcon :platform="platform.keyword" size="xs" tile />
          {{ platform.label }}
        </button>

        <!-- Curated toggle: hide categories with no active services -->
        <button
          class="ml-auto flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-colors"
          role="switch"
          :aria-checked="store.curatedOnly"
          :title="store.curatedOnly ? 'Only categories with active services' : 'Show all categories'"
          @click="onToggleCurated"
        >
          <span
            class="relative h-5 w-9 rounded-full transition-colors duration-200"
            :class="store.curatedOnly ? 'bg-gradient-to-r from-brand-500 to-brand-600 shadow-glow' : 'bg-white/10'"
          >
            <span
              class="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200"
              :class="store.curatedOnly ? 'translate-x-[18px]' : 'translate-x-0.5'"
            />
          </span>
          <span class="text-xs" :class="store.curatedOnly ? 'text-white' : 'text-white/50'">
            Curated only
          </span>
        </button>

        <!-- The rest -->
        <div v-if="otherCategories.length" class="relative">
          <button
            class="flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-all"
            :class="
              store.activeCategory !== 'all' && activePlatform === ''
                ? 'bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-glow'
                : 'glass text-white/60 hover:text-white'
            "
            @click="showMore = !showMore"
          >
            More
            <ChevronDown class="h-3.5 w-3.5" :class="showMore ? 'rotate-180' : ''" />
          </button>

          <Transition name="fade">
          <div
            v-if="showMore"
            class="absolute right-0 z-30 mt-2 max-h-72 w-72 overflow-y-auto rounded-2xl border border-white/10 bg-night-soft/95 p-3 shadow-glow backdrop-blur-xl"
          >
            <button
              v-for="category in otherCategories"
              :key="category._id"
              class="block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors"
              :class="
                store.activeCategory === category._id
                  ? 'bg-brand-500/20 text-white'
                  : 'text-white/60 hover:bg-white/5 hover:text-white'
              "
              @click="selectCategory(category._id)"
            >
              {{ category.name }}
            </button>
          </div>
          </Transition>
        </div>
      </div>
    </div>

    <!-- Platform banner (trending) -->
    <Transition name="fade">
      <div
        v-if="activePlatformMeta"
        class="relative overflow-hidden rounded-2xl p-5 shadow-glow"
        :class="activePlatformMeta.color"
      >
        <div class="bg-grid pointer-events-none absolute inset-0 opacity-15" />
        <div class="relative flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 text-white backdrop-blur">
              <PlatformIcon :platform="activePlatformMeta.keyword" size="sm" />
            </div>
            <div>
              <p class="font-display text-lg font-bold text-white">
                {{ activePlatformMeta.label }} services
              </p>
              <p class="flex items-center gap-1 text-xs text-white/70">
                <TrendingUp class="h-3 w-3" /> Trending picks for Cambodia — featured first, newest after
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span
              v-if="store.total > platformAll.length"
              class="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white backdrop-blur"
            >
              Top {{ platformAll.length.toLocaleString() }} of {{ store.total.toLocaleString() }}
            </span>
            <span
              v-else
              class="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white backdrop-blur"
            >
              {{ store.total.toLocaleString() }} services
            </span>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Filter panel -->
    <Transition name="fade">
      <div
        v-if="showFilters || activeFilterCount > 0"
        class="glass rounded-2xl border border-white/10 p-5 shadow-card"
      >
        <div class="flex items-center justify-between gap-3">
          <p class="text-sm font-semibold text-white">Filter services</p>
          <button
            v-if="activeFilterCount > 0"
            class="inline-flex items-center gap-1 text-xs font-medium text-brand-300 hover:text-brand-200"
            @click="resetFilters"
          >
            <X class="h-3 w-3" /> Reset filters
          </button>
        </div>

        <div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <!-- Price range (per 1,000) -->
          <div class="space-y-1.5">
            <label class="text-xs font-medium text-white/50">Rate / 1,000 ($)</label>
            <div class="flex items-center gap-2">
              <input
                v-model="minPrice"
                type="number"
                min="0"
                step="0.01"
                placeholder="Min"
                class="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/30 focus:border-brand-400/60 focus:outline-none"
              />
              <span class="text-white/30">–</span>
              <input
                v-model="maxPrice"
                type="number"
                min="0"
                step="0.01"
                placeholder="Max"
                class="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/30 focus:border-brand-400/60 focus:outline-none"
              />
            </div>
          </div>

          <!-- Service type -->
          <div class="space-y-1.5">
            <label class="text-xs font-medium text-white/50">Service type</label>
            <select
              v-model="serviceType"
              class="h-10 w-full appearance-none rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white [&>option]:bg-night focus:border-brand-400/60 focus:outline-none"
            >
              <option value="">All types</option>
              <option v-for="t in TYPE_CHIPS" :key="t" :value="t">
                {{ SERVICE_TYPE_LABEL[t] ?? t }}
              </option>
            </select>
          </div>

          <!-- Toggles -->
          <div class="flex flex-wrap items-end gap-2">
            <button
              class="flex h-10 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-all"
              :class="
                onlyRefill
                  ? 'border-emerald-400/60 bg-emerald-400/15 text-emerald-200'
                  : 'border-white/10 bg-white/5 text-white/60 hover:text-white'
              "
              @click="onlyRefill = !onlyRefill"
            >
              <Check v-if="onlyRefill" class="h-3.5 w-3.5" /> Refill
            </button>
            <button
              class="flex h-10 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-all"
              :class="
                onlyCancel
                  ? 'border-sky-400/60 bg-sky-400/15 text-sky-200'
                  : 'border-white/10 bg-white/5 text-white/60 hover:text-white'
              "
              @click="onlyCancel = !onlyCancel"
            >
              <Check v-if="onlyCancel" class="h-3.5 w-3.5" /> Cancellable
            </button>
          </div>

          <!-- Featured only -->
          <button
            class="flex h-10 items-center justify-center gap-1.5 rounded-lg border text-xs font-medium transition-all"
            :class="
              onlyFeatured
                ? 'border-amber-400/60 bg-amber-400/15 text-amber-200'
                : 'border-white/10 bg-white/5 text-white/60 hover:text-white'
            "
            @click="onlyFeatured = !onlyFeatured"
          >
            <Sparkles class="h-3.5 w-3.5" />
            {{ onlyFeatured ? 'Featured only' : 'Featured' }}
          </button>
        </div>
      </div>
    </Transition>

    <!-- ====================================================================
         PLATFORM MODE — subcategory chips + grouped sections
         ==================================================================== -->
    <template v-if="platformMode">
      <!-- Result summary -->
      <p v-if="!store.loading" class="text-xs text-white/40">
        {{ platformFiltered.length.toLocaleString() }} service{{ platformFiltered.length === 1 ? '' : 's' }}
        · {{ groups.length }} {{ groups.length === 1 ? 'group' : 'groups' }}
        <template v-if="hasFilters"> matching your filters</template>
      </p>

      <div v-if="store.loading" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <BaseSkeleton v-for="n in 8" :key="n" class="h-64 w-full" />
      </div>

      <BaseEmptyState
        v-else-if="store.error"
        :title="store.error"
        message="Try adjusting your filters or try again later."
      >
        <button class="mt-2 text-sm font-semibold text-brand-300 hover:text-brand-200" @click="loadPlatform">
          Retry
        </button>
      </BaseEmptyState>

      <BaseEmptyState
        v-else-if="groups.length === 0"
        title="No services found"
        message="We couldn't find any services matching your filters for this platform."
      >
        <button
          v-if="hasFilters"
          class="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-300 hover:text-brand-200"
          @click="clearFilters"
        >
          <RotateCcw class="h-3.5 w-3.5" /> Clear all filters
        </button>
      </BaseEmptyState>

      <template v-else>
        <!-- Subcategory chips -->
        <div class="-mb-1 flex items-center gap-2 overflow-x-auto pb-1">
          <button
            class="flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition-all"
            :class="
              activeSubcategory === 'all'
                ? 'bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-glow'
                : 'glass text-white/60 hover:text-white'
            "
            @click="selectSubcategory('all')"
          >
            <Layers class="h-4 w-4" />
            All
            <span
              class="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
              :class="activeSubcategory === 'all' ? 'bg-white/20' : 'bg-white/10'"
            >
              {{ platformFiltered.length }}
            </span>
          </button>

          <button
            v-for="group in groups"
            :key="group.key"
            class="flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition-all"
            :class="
              activeSubcategory === group.key
                ? 'bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-glow'
                : 'glass text-white/60 hover:text-white'
            "
            @click="selectSubcategory(group.key)"
          >
            {{ group.label }}
            <span
              class="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
              :class="activeSubcategory === group.key ? 'bg-white/20' : 'bg-white/10'"
            >
              {{ group.count }}
            </span>
          </button>
        </div>

        <!-- All groups → stacked sections -->
        <div v-if="activeSubcategory === 'all'" class="space-y-8">
          <section
            v-for="group in groups"
            :key="group.key"
            class="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 transition-colors hover:border-white/10"
          >
            <div class="flex flex-wrap items-end justify-between gap-2">
              <div class="flex items-center gap-2.5">
                <div
                  class="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br text-white"
                  :class="activePlatformMeta?.color"
                >
                  <PlatformIcon :platform="activePlatformMeta?.keyword ?? 'other'" size="xs" />
                </div>
                <h2 class="font-display text-lg font-semibold text-white">{{ group.label }}</h2>
                <span class="rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium text-white/60">
                  {{ group.count }}
                </span>
              </div>
              <span class="text-xs text-white/45">
                from
                <span class="font-semibold text-emerald-300">{{ formatMoney(group.minPricePerThousand) }}</span>
                / 1,000
              </span>
            </div>

            <div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              <ServiceCard
                v-for="service in visibleServices(group)"
                :key="service._id"
                :service="service"
                @buy="openBuy"
              />
            </div>

            <button
              v-if="group.services.length > GROUP_CARD_CAP"
              class="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-300 transition-colors hover:text-brand-200"
              @click="toggleExpand(group)"
            >
              {{ expandedGroups.has(group.key) ? 'Show less' : `Show all ${group.services.length} services` }}
              <ChevronDown class="h-3.5 w-3.5" :class="expandedGroups.has(group.key) ? 'rotate-180' : ''" />
            </button>
          </section>
        </div>

        <!-- Single subcategory → flat grid -->
        <div v-else-if="activeGroup" class="space-y-4">
          <div class="flex flex-wrap items-center gap-3">
            <button
              class="inline-flex items-center gap-1.5 text-sm font-medium text-white/50 transition-colors hover:text-white"
              @click="selectSubcategory('all')"
            >
              <ArrowLeft class="h-4 w-4" /> All groups
            </button>
            <h2 class="font-display text-lg font-semibold text-white">{{ activeGroup.label }}</h2>
            <span class="rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium text-white/60">
              {{ activeGroup.count }} services
            </span>
          </div>

          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <ServiceCard
              v-for="service in activeGroup.services"
              :key="service._id"
              :service="service"
              @buy="openBuy"
            />
          </div>
        </div>
      </template>
    </template>

    <!-- ====================================================================
         SERVER MODE — search / other categories / pagination
         ==================================================================== -->
    <template v-else>
      <!-- Result count -->
      <p v-if="!store.loading && store.services.length" class="text-xs text-white/40">
        {{ store.total.toLocaleString() }} service{{ store.total === 1 ? '' : 's' }}
        <template v-if="hasFilters"> matching your filters</template>
      </p>

      <!-- Grid -->
      <div v-if="store.loading" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <BaseSkeleton v-for="n in 8" :key="n" class="h-64 w-full" />
      </div>

      <div
        v-else-if="store.services.length"
        class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      >
        <ServiceCard
          v-for="service in store.services"
          :key="service._id"
          :service="service"
          @buy="openBuy"
        />
      </div>

      <BaseEmptyState
        v-else-if="store.error"
        :title="store.error"
        message="Try adjusting your filters or try again later."
      >
        <button class="mt-2 text-sm font-semibold text-brand-300 hover:text-brand-200" @click="load">
          Retry
        </button>
      </BaseEmptyState>

      <BaseEmptyState
        v-else
        title="No services found"
        message="We couldn't find any services matching your filters."
      >
        <button
          v-if="hasFilters"
          class="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-300 hover:text-brand-200"
          @click="clearFilters"
        >
          <RotateCcw class="h-3.5 w-3.5" /> Clear all filters
        </button>
      </BaseEmptyState>

      <BasePagination
        :page="page"
        :total="store.total"
        :limit="PAGE_SIZE"
        @change="(p) => { page = p; void load() }"
      />
    </template>

    <BuyServiceModal :open="buyOpen" :service="buyingService" @close="buyOpen = false" />
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
