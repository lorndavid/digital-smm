<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight, PackageOpen, RefreshCw } from '@lucide/vue'
import { servicesApi } from '@/api/services.api'
import { formatUnitPrice, formatNumber } from '@/utils/format'
import { inferPlatformFromCategoryName } from '@/utils/serviceGroups'
import PlatformIcon from '@/components/ui/PlatformIcon.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import type { Service } from '@/types/models'

const router = useRouter()

const services = ref<Service[]>([])
const loading = ref(true)
const error = ref(false)
let loaded = false

/** Platform key for a service (category object → platform; else infer). */
function platformOf(s: Service): string {
  const cat = s.category
  if (cat && typeof cat === 'object') return cat.platform || 'other'
  return inferPlatformFromCategoryName(s.name)
}

function categoryNameOf(s: Service): string {
  const cat = s.category
  return cat && typeof cat === 'object' ? cat.name : ''
}

async function load(): Promise<void> {
  if (loaded) return
  loading.value = true
  error.value = false
  try {
    // Featured-first, falls back to the general catalogue when nothing is
    // featured — either way the visitor sees real, purchasable services.
    let items = (await servicesApi.list({ featured: true, limit: 4 })).items
    if (items.length === 0) {
      items = (await servicesApi.list({ limit: 4 })).items
    }
    services.value = items
  } catch {
    error.value = true
  } finally {
    loading.value = false
    loaded = true
  }
}

const showCards = computed(() => services.value.length > 0)

/** Re-attempts the load after an error (the guard is released first). */
async function retry(): Promise<void> {
  loaded = false
  await load()
}

onMounted(load)
</script>

<template>
  <section class="container-page py-14 sm:py-18">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div class="max-w-xl">
        <p class="text-xs font-semibold uppercase tracking-widest text-primary">Popular right now</p>
        <h2 class="font-display mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Services people love
        </h2>
        <p class="mt-2 text-sm text-muted-foreground">
          Real engagement for the platforms your audience lives on. Pick one and order in seconds.
        </p>
      </div>
      <RouterLink
        to="/dashboard/services"
        class="group inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition-colors hover:text-primary/80"
      >
        View all services
        <ArrowRight class="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </RouterLink>
    </div>

    <!-- Skeleton loaders match the card dimensions -->
    <div v-if="loading" class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div
        v-for="n in 4"
        :key="n"
        class="skeleton h-[212px] rounded-xl border border-border"
      />
    </div>

    <!-- Friendly error state -->
    <div
      v-else-if="error"
      class="mt-8 flex flex-col items-center rounded-2xl border border-border bg-card px-6 py-10 text-center"
    >
      <p class="font-display text-lg font-semibold text-foreground">Something went wrong.</p>
      <p class="mt-2 max-w-sm text-sm text-muted-foreground">
        We couldn't load the catalogue. Give it another try.
      </p>
      <BaseButton variant="outline" class="mt-6" @click="retry">
        <RefreshCw class="h-4 w-4" /> Try again
      </BaseButton>
    </div>

    <!-- Beautiful empty state -->
    <div
      v-else-if="!showCards"
      class="mt-8 flex flex-col items-center rounded-2xl border border-border bg-card px-6 py-10 text-center"
    >
      <span class="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <PackageOpen class="h-6 w-6" />
      </span>
      <p class="font-display mt-4 text-lg font-semibold text-foreground">
        No products available right now
      </p>
      <p class="mt-2 max-w-sm text-sm text-muted-foreground">
        Our catalogue is being refreshed. Check back soon or browse the full catalog.
      </p>
      <BaseButton variant="primary" class="mt-6" @click="router.push('/dashboard/services')">
        Browse the catalog <ArrowRight class="h-4 w-4" />
      </BaseButton>
    </div>

    <!-- Product cards -->
    <div v-else class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div
        v-for="(service, index) in services"
        :key="service._id"
        v-motion
        :initial="{ opacity: 0, y: 20 }"
        :visible="{ opacity: 1, y: 0, transition: { duration: 0.4, delay: index * 0.06 } }"
        class="group flex flex-col rounded-xl border border-border bg-card p-5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-card"
      >
        <div class="flex items-center justify-between">
          <PlatformIcon :platform="platformOf(service)" size="md" tile />
          <span
            v-if="service.refill"
            class="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400"
          >
            Refill
          </span>
        </div>

        <h3 class="font-display mt-4 line-clamp-2 text-sm font-semibold text-foreground">
          {{ service.name }}
        </h3>
        <p class="mt-1 text-xs text-muted-foreground">{{ categoryNameOf(service) || 'DigitalSMM' }}</p>

        <div class="mt-auto pt-4">
          <p class="text-[13px] text-muted-foreground">
            from
            <span class="font-display text-base font-bold text-foreground">
              {{ formatUnitPrice(service.pricePerUnit) }}
            </span>
            <span class="text-[11px]">/1K</span>
          </p>
          <p class="mt-0.5 text-xs text-muted-foreground">
            {{ formatNumber(service.min) }}–{{ formatNumber(service.max) }} units
          </p>
          <button
            class="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary py-2 text-[13px] font-semibold text-primary-foreground transition-all duration-200 hover:bg-primary/90 active:scale-[0.98]"
            @click="router.push('/dashboard/services')"
          >
            Order now <ArrowRight class="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
