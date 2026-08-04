<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  ArrowUpDown,
  Camera,
  Check,
  ChevronDown,
  Music2,
  Play,
  RotateCcw,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  ThumbsUp,
  TrendingUp,
  X,
} from '@lucide/vue'
import { watchDebounced } from '@vueuse/core'
import { useServicesStore } from '@/stores/services.store'
import ServiceCard from '@/components/dashboard/ServiceCard.vue'
import BuyServiceModal from '@/components/dashboard/BuyServiceModal.vue'
import BasePagination from '@/components/ui/BasePagination.vue'
import BaseSkeleton from '@/components/ui/BaseSkeleton.vue'
import BaseEmptyState from '@/components/ui/BaseEmptyState.vue'
import type { Category, Service } from '@/types/models'
import type { ServiceSort } from '@/api/services.api'
import { PLATFORM_META, SERVICE_TYPE_LABEL } from '@/utils/constants'

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

// ---------------------------------------------------------------------------
// Curated platforms for the Cambodia market: the platforms Cambodian users
// actually grow on are shown first. Each chip maps to a keyword that matches
// EVERY category whose name contains it (SMMWiz splits platforms across many
// category names), so clicking "Facebook" shows all Facebook services.
// ---------------------------------------------------------------------------

const MAIN_PLATFORMS = [
  { keyword: 'facebook', label: 'Facebook', icon: ThumbsUp },
  { keyword: 'tiktok', label: 'TikTok', icon: Music2 },
  { keyword: 'telegram', label: 'Telegram', icon: Send },
  { keyword: 'youtube', label: 'YouTube', icon: Play },
  { keyword: 'instagram', label: 'Instagram', icon: Camera },
] as const

const activePlatform = ref('')

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
    activePlatform.value !== '',
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
  store.selectCategory('all')
  page.value = 1
  void load()
}

// ---------------------------------------------------------------------------

async function load(): Promise<void> {
  const min = Number(minPrice.value)
  const max = Number(maxPrice.value)
  await store.fetchServices({
    platform: activePlatform.value || undefined,
    category:
      !activePlatform.value && store.activeCategory !== 'all'
        ? store.activeCategory
        : undefined,
    search: search.value.trim() || undefined,
    sort: sort.value === 'recommended' ? undefined : sort.value,
    minPrice: minPrice.value && Number.isFinite(min) ? min / 1000 : undefined,
    maxPrice: maxPrice.value && Number.isFinite(max) ? max / 1000 : undefined,
    type: serviceType.value || undefined,
    refill: onlyRefill.value || undefined,
    cancel: onlyCancel.value || undefined,
    featured: onlyFeatured.value || undefined,
    page: page.value,
    limit: PAGE_SIZE,
  })
}

/** Clicking a main platform chip filters by keyword (all matching categories). */
function selectPlatform(keyword: string): void {
  activePlatform.value = activePlatform.value === keyword ? '' : keyword
  store.selectCategory('all')
  page.value = 1
  void load()
}

/** "All" chip: keep search/price/type filters, only clear the platform chip. */
function selectAll(): void {
  activePlatform.value = ''
  store.selectCategory('all')
  page.value = 1
  void load()
}

function selectCategory(categoryId: string): void {
  activePlatform.value = ''
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
  page.value = 1
  void load()
}

watchDebounced(
  [search, minPrice, maxPrice, serviceType, onlyRefill, onlyCancel, onlyFeatured],
  () => {
    page.value = 1
    void load()
  },
  { debounce: 350 },
)

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
          <component :is="platform.icon" class="h-4 w-4" />
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
              <component :is="activePlatformMeta.icon" class="h-5 w-5" />
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
          <span class="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
            {{ store.total.toLocaleString() }} services
          </span>
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
            @click="clearFilters"
          >
            <X class="h-3 w-3" /> Reset filters
          </button>
        </div>

        <div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <!-- Price range (per 1,000) -->
          <div class="space-y-1.5">
            <label class="text-xs font-medium text-white/50">Price / 1,000 ($)</label>
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
