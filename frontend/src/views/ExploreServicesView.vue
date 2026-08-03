<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Search } from '@lucide/vue'
import { watchDebounced } from '@vueuse/core'
import { useServicesStore } from '@/stores/services.store'
import ServiceCard from '@/components/dashboard/ServiceCard.vue'
import BuyServiceModal from '@/components/dashboard/BuyServiceModal.vue'
import BasePagination from '@/components/ui/BasePagination.vue'
import BaseSkeleton from '@/components/ui/BaseSkeleton.vue'
import BaseEmptyState from '@/components/ui/BaseEmptyState.vue'
import type { Service } from '@/types/models'

const store = useServicesStore()

const page = ref(1)
const search = ref('')
const buyingService = ref<Service | null>(null)
const buyOpen = ref(false)

const PAGE_SIZE = 12

async function load(): Promise<void> {
  await store.fetchServices({
    category: store.activeCategory === 'all' ? undefined : store.activeCategory,
    search: search.value.trim() || undefined,
    page: page.value,
    limit: PAGE_SIZE,
  })
}

function selectCategory(categoryId: string): void {
  store.selectCategory(categoryId)
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
    <div>
      <h1 class="font-display text-2xl font-bold text-white">Explore Services</h1>
      <p class="mt-1 text-sm text-white/50">
        Choose a platform, pick a service and grow in minutes.
      </p>
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

      <div class="flex gap-2 overflow-x-auto pb-1">
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
        <button
          v-for="category in store.categories"
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
