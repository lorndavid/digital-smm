<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ArrowUpDown, ChevronDown, Search } from '@lucide/vue'
import { watchDebounced } from '@vueuse/core'
import { useServicesStore } from '@/stores/services.store'
import ServiceCard from '@/components/dashboard/ServiceCard.vue'
import BuyServiceModal from '@/components/dashboard/BuyServiceModal.vue'
import BasePagination from '@/components/ui/BasePagination.vue'
import BaseSkeleton from '@/components/ui/BaseSkeleton.vue'
import BaseEmptyState from '@/components/ui/BaseEmptyState.vue'
import type { Category, Service } from '@/types/models'
import type { ServiceSort } from '@/api/services.api'

const store = useServicesStore()

const page = ref(1)
const search = ref('')
const sort = ref<'recommended' | ServiceSort>('recommended')
const showMore = ref(false)
const buyingService = ref<Service | null>(null)
const buyOpen = ref(false)

const PAGE_SIZE = 12

// ---------------------------------------------------------------------------
// Curated categories: the main platforms are always shown first, everything
// else is tucked into the "More categories" dropdown.
// ---------------------------------------------------------------------------

const MAIN_PLATFORMS = ['TikTok', 'Facebook', 'Instagram', 'YouTube', 'Telegram']

const mainCategories = computed<Category[]>(() => {
  const found: Category[] = []
  const used = new Set<string>()
  for (const platform of MAIN_PLATFORMS) {
    const exact = store.categories.find(
      (c) => c.name.trim().toLowerCase() === platform.toLowerCase(),
    )
    const hit =
      exact ??
      store.categories.find((c) => c.name.trim().toLowerCase().startsWith(platform.toLowerCase()))
    if (hit && !used.has(hit._id)) {
      found.push(hit)
      used.add(hit._id)
    }
  }
  return found
})

const otherCategories = computed<Category[]>(() => {
  const mainIds = new Set(mainCategories.value.map((c) => c._id))
  return store.categories.filter((c) => !mainIds.has(c._id))
})

const sortOptions: Array<{ value: 'recommended' | ServiceSort; label: string }> = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'price_asc', label: 'Price: low → high' },
  { value: 'price_desc', label: 'Price: high → low' },
  { value: 'name_asc', label: 'Name A → Z' },
  { value: 'newest', label: 'Newest first' },
]

// ---------------------------------------------------------------------------

async function load(): Promise<void> {
  await store.fetchServices({
    category: store.activeCategory === 'all' ? undefined : store.activeCategory,
    search: search.value.trim() || undefined,
    sort: sort.value === 'recommended' ? undefined : sort.value,
    page: page.value,
    limit: PAGE_SIZE,
  })
}

function selectCategory(categoryId: string): void {
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
  search,
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
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="font-display text-2xl font-bold text-white">Explore Services</h1>
        <p class="mt-1 text-sm text-white/50">
          Choose a platform, pick a service and grow in minutes.
        </p>
      </div>

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
            store.activeCategory === 'all'
              ? 'bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-glow'
              : 'glass text-white/60 hover:text-white'
          "
          @click="selectCategory('all')"
        >
          All
        </button>

        <!-- Main platforms first -->
        <button
          v-for="category in mainCategories"
          :key="category._id"
          class="shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-all"
          :class="
            store.activeCategory === category._id
              ? 'bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-glow'
              : 'glass text-white/60 hover:text-white'
          "
          @click="selectCategory(category._id)"
        >
          {{ category.name }}
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
              mainCategories.every((c) => store.activeCategory !== c._id) &&
              store.activeCategory !== 'all'
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
      message="We couldn't find any services matching your search."
    />

    <BasePagination :page="page" :total="store.total" :limit="PAGE_SIZE" @change="(p) => { page = p; void load() }" />

    <BuyServiceModal :open="buyOpen" :service="buyingService" @close="buyOpen = false" />
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
