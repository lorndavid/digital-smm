<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight, Heart, Star } from '@lucide/vue'
import { useFavoritesStore } from '@/stores/favorites.store'
import { useServicesStore } from '@/stores/services.store'
import { useToast } from '@/composables/useToast'
import { PLATFORM_META } from '@/utils/constants'
import { formatMoney } from '@/utils/format'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseEmptyState from '@/components/ui/BaseEmptyState.vue'
import BaseSkeleton from '@/components/ui/BaseSkeleton.vue'
import PlatformIcon from '@/components/ui/PlatformIcon.vue'
import type { Category, Platform, Service } from '@/types/models'

const favoritesStore = useFavoritesStore()
const store = useServicesStore()
const router = useRouter()
const toast = useToast()

/** Favourited categories resolved against the loaded catalogue (deleted or
 *  hidden categories are skipped so a card never points at a dead filter). */
const favoriteCategories = computed(() => {
  const byId = new Map(store.categories.map((c) => [c._id, c]))
  return favoritesStore.ids
    .map((id) => byId.get(id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
})

/** Favourited services — resolved by the backend in ONE request, so the tab
 *  renders instantly with no full-catalogue pagination. */
const favoriteServices = computed(() => favoritesStore.favoriteServices)

/** Platform of a favourited service (from its category) — drives the tile. */
function servicePlatform(s: Service): Platform {
  const cat = s.category
  if (cat && typeof cat === 'object' && 'platform' in cat) {
    return (cat as Category).platform
  }
  if (typeof cat === 'string') {
    return store.categories.find((c) => c._id === cat)?.platform ?? 'other'
  }
  return 'other'
}

function serviceCategoryName(s: Service): string {
  const cat = s.category
  if (cat && typeof cat === 'object' && 'name' in cat) return cat.name
  if (typeof cat === 'string') {
    return store.categories.find((c) => c._id === cat)?.name ?? 'General'
  }
  return 'General'
}

/** Opens Explore Services with this category auto-set (service stays empty). */
function browse(categoryId: string): void {
  void router.push({ name: 'services', query: { category: categoryId } })
}

/** Opens Explore Services with this service auto-set — category + service are
 *  pre-filled and the order form is ready (quantity untouched, link empty). */
function orderService(service: Service): void {
  void router.push({
    name: 'services',
    query: { serviceId: service._id, serviceName: service.name },
  })
}

async function remove(categoryId: string, name: string): Promise<void> {
  try {
    await favoritesStore.toggle(categoryId)
    toast.success(`${name} removed from favourites`)
  } catch {
    toast.error('Could not update favourites')
  }
}

async function removeService(service: Service): Promise<void> {
  try {
    await favoritesStore.toggleService(service._id)
    toast.success(`${service.name} removed from favourites`)
  } catch {
    toast.error('Could not update favourites')
  }
}

const isEmpty = computed(
  () => favoriteCategories.value.length === 0 && favoriteServices.value.length === 0,
)

/** True when the customer has NO favourites at all (from the store, so it
 *  doesn't wait for the catalogue to resolve). */
const hardEmpty = computed(
  () => favoritesStore.ids.length === 0 && favoritesStore.serviceIds.length === 0,
)

onMounted(() => {
  void favoritesStore.fetch()
  if (store.categories.length === 0) void store.fetchCategories()
})
</script>

<template>
  <div class="w-full space-y-5">
    <!-- Header -->
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="font-display text-xl font-bold text-ink">Favourites</h1>
        <p class="mt-0.5 text-sm text-ink/50">
          Your favourite categories and services — tap one to jump straight to a pre-filled order.
        </p>
      </div>
      <div
        v-if="favoriteCategories.length > 0 || favoriteServices.length > 0"
        class="flex items-center gap-2"
      >
        <span
          v-if="favoriteCategories.length > 0"
          class="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-xs font-medium text-amber-400"
        >
          <Star class="h-3 w-3 fill-amber-400" />
          {{ favoriteCategories.length }}
          {{ favoriteCategories.length === 1 ? 'category' : 'categories' }}
        </span>
        <span
          v-if="favoriteServices.length > 0"
          class="inline-flex items-center gap-1.5 rounded-full border border-rose-400/30 bg-rose-400/10 px-3 py-1.5 text-xs font-medium text-rose-300"
        >
          <Heart class="h-3 w-3 fill-rose-400" />
          {{ favoriteServices.length }}
          {{ favoriteServices.length === 1 ? 'service' : 'services' }}
        </span>
      </div>
    </div>

    <!-- Loading — while the favourites fetch OR the catalogue resolves (an
         existing favourite must never flash a "no favourites" empty state
         just because its card data hasn't arrived yet). -->
    <div
      v-if="favoritesStore.loading || (!hardEmpty && isEmpty)"
      class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      <BaseSkeleton v-for="n in 4" :key="n" class="h-24 w-full rounded-2xl" />
    </div>

    <!-- Empty -->
    <BaseEmptyState
      v-else-if="hardEmpty"
      title="No favourites yet"
      message="Tap the star next to any category or service in Explore Services to pin it here for one-tap re-ordering."
    >
      <template #icon>
        <Heart class="h-5 w-5 text-rose-400" />
      </template>
      <BaseButton size="sm" class="mt-2" @click="router.push({ name: 'services' })">
        Explore Services
        <ArrowRight class="h-3.5 w-3.5" />
      </BaseButton>
    </BaseEmptyState>

    <template v-else>
      <!-- Service cards -->
      <div v-if="favoriteServices.length > 0" class="space-y-3">
        <h2 class="text-xs font-semibold uppercase tracking-wider text-ink/40">
          Services
          <span class="ml-1 font-normal text-ink/25">{{ favoriteServices.length }}</span>
        </h2>
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <div
            v-for="service in favoriteServices"
            :key="service._id"
            class="group relative cursor-pointer overflow-hidden rounded-2xl border border-ink/10 bg-card/70 p-4 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-400/40 hover:shadow-glow"
            :data-favorite-service="service._id"
            role="button"
            :tabindex="0"
            :aria-label="`Order ${service.name} again`"
            @click="orderService(service)"
            @keydown.enter="orderService(service)"
          >
            <div class="flex items-start gap-3">
              <PlatformIcon :platform="servicePlatform(service)" size="md" tile />
              <div class="min-w-0 flex-1">
                <h3 class="truncate font-display text-sm font-semibold text-ink">
                  {{ service.name }}
                </h3>
                <p class="mt-0.5 truncate text-xs text-ink/45">
                  {{ serviceCategoryName(service) }}
                </p>
              </div>
              <button
                type="button"
                :data-unfavorite-service="service._id"
                :aria-label="`Remove ${service.name} from favourites`"
                :title="'Remove from favourites'"
                class="shrink-0 rounded-lg p-1.5 text-rose-400 transition-all hover:bg-rose-500/10 active:scale-90"
                @click.stop="removeService(service)"
              >
                <Heart class="h-4 w-4 fill-rose-400" />
              </button>
            </div>
            <div class="mt-3 flex items-center justify-between gap-2">
              <span class="text-sm font-semibold text-emerald-300">
                {{ formatMoney(service.pricePerUnit) }} / 1,000
              </span>
              <span class="flex items-center gap-1 text-xs font-medium text-brand-300 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                Order again
                <ArrowRight class="h-3 w-3 transition-transform duration-200 group-hover:translate-x-0.5" />
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Category cards -->
      <div v-if="favoriteCategories.length > 0" class="space-y-3">
        <h2 class="text-xs font-semibold uppercase tracking-wider text-ink/40">
          Categories
          <span class="ml-1 font-normal text-ink/25">{{ favoriteCategories.length }}</span>
        </h2>
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <div
            v-for="category in favoriteCategories"
            :key="category._id"
            class="group relative cursor-pointer overflow-hidden rounded-2xl border border-ink/10 bg-card/70 p-4 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-400/40 hover:shadow-glow"
            :data-favorite-category="category._id"
            role="button"
            :tabindex="0"
            :aria-label="`Browse ${category.name} services`"
            @click="browse(category._id)"
            @keydown.enter="browse(category._id)"
          >
            <div class="flex items-start gap-3">
              <PlatformIcon :platform="category.platform" size="md" tile />
              <div class="min-w-0 flex-1">
                <h3 class="truncate font-display text-sm font-semibold text-ink">
                  {{ category.name }}
                </h3>
                <p class="mt-0.5 text-xs text-ink/45">
                  {{ PLATFORM_META[category.platform]?.label ?? category.platform }}
                </p>
              </div>
              <button
                type="button"
                :data-unfavorite="category._id"
                :aria-label="`Remove ${category.name} from favourites`"
                :title="'Remove from favourites'"
                class="shrink-0 rounded-lg p-1.5 text-amber-400 transition-all hover:bg-rose-500/10 hover:text-rose-400 active:scale-90"
                @click.stop="remove(category._id, category.name)"
              >
                <Star class="h-4 w-4 fill-amber-400" />
              </button>
            </div>
            <div class="mt-3 flex items-center gap-1 text-xs font-medium text-brand-300 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              Browse services
              <ArrowRight class="h-3 w-3 transition-transform duration-200 group-hover:translate-x-0.5" />
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
