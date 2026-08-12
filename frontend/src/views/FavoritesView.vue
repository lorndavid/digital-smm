<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight, Heart, Star } from '@lucide/vue'
import { useFavoritesStore } from '@/stores/favorites.store'
import { useServicesStore } from '@/stores/services.store'
import { useToast } from '@/composables/useToast'
import { PLATFORM_META } from '@/utils/constants'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseEmptyState from '@/components/ui/BaseEmptyState.vue'
import BaseSkeleton from '@/components/ui/BaseSkeleton.vue'
import PlatformIcon from '@/components/ui/PlatformIcon.vue'

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

/** Opens Explore Services with this category auto-set (service stays empty). */
function browse(categoryId: string): void {
  void router.push({ name: 'services', query: { category: categoryId } })
}

async function remove(categoryId: string, name: string): Promise<void> {
  try {
    await favoritesStore.toggle(categoryId)
    toast.success(`${name} removed from favourites`)
  } catch {
    toast.error('Could not update favourites')
  }
}

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
          Your favourite categories — tap one to jump straight to its services.
        </p>
      </div>
      <span
        v-if="favoriteCategories.length > 0"
        class="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-xs font-medium text-amber-400"
      >
        <Star class="h-3 w-3 fill-amber-400" />
        {{ favoriteCategories.length }}
        {{ favoriteCategories.length === 1 ? 'favourite' : 'favourites' }}
      </span>
    </div>

    <!-- Loading -->
    <div v-if="favoritesStore.loading && favoritesStore.ids.length === 0" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <BaseSkeleton v-for="n in 4" :key="n" class="h-24 w-full rounded-2xl" />
    </div>

    <!-- Empty -->
    <BaseEmptyState
      v-else-if="favoriteCategories.length === 0"
      title="No favourites yet"
      message="Tap the star next to any category in Explore Services to pin it here for one-tap access."
    >
      <template #icon>
        <Heart class="h-5 w-5 text-rose-400" />
      </template>
      <BaseButton size="sm" class="mt-2" @click="router.push({ name: 'services' })">
        Explore Services
        <ArrowRight class="h-3.5 w-3.5" />
      </BaseButton>
    </BaseEmptyState>

    <!-- Cards -->
    <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
