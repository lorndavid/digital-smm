<script setup lang="ts">
import { computed } from 'vue'
import { Clock, RefreshCcw, Sparkles } from '@lucide/vue'
import type { Service } from '@/types/models'
import { formatMoney } from '@/utils/format'
import { PLATFORM_META, SERVICE_TYPE_LABEL, SMM_PROVIDER_LABEL } from '@/utils/constants'
import { inferPlatformFromCategoryName } from '@/utils/serviceGroups'
import PlatformIcon from '@/components/ui/PlatformIcon.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseBadge from '@/components/ui/BaseBadge.vue'

const props = defineProps<{ service: Service }>()
const emit = defineEmits<{ buy: [service: Service] }>()

/**
 * Resolves the card's platform: prefers the category's own platform field,
 * falls back to inferring it from the category name (synced categories are
 * 'other' until the backend inference pass or an admin sets them).
 */
function categoryPlatform(service: Service) {
  const category = service.category
  if (category && typeof category === 'object' && 'platform' in category) {
    const declared = category.platform
    if (declared && declared !== 'other') return declared
    const name = 'name' in category ? (category.name as string) : ''
    return inferPlatformFromCategoryName(name)
  }
  return 'other'
}

// PlatformIcon falls back to its 'other' glyph for unknown platforms, so no
// existence check is needed here.
const platformKey = computed(() => categoryPlatform(props.service))

function platformOf(service: Service) {
  return PLATFORM_META[categoryPlatform(service) as keyof typeof PLATFORM_META] ?? PLATFORM_META.other
}
</script>

<template>
  <div
    class="group glass relative flex flex-col overflow-hidden rounded-xl p-4 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:border-brand-400/30 hover:shadow-glow"
  >
    <div
      class="pointer-events-none absolute -right-14 -top-14 h-40 w-40 rounded-full bg-gradient-to-br opacity-10 blur-2xl transition-opacity duration-300 group-hover:opacity-20"
      :class="platformOf(service).color"
    />

    <div class="flex items-start justify-between gap-3">
      <div class="transition-transform duration-300 group-hover:scale-110">
        <PlatformIcon :platform="platformKey" size="md" tile />
      </div>
      <div class="flex flex-col items-end gap-1">
        <BaseBadge v-if="service.isFeatured" tone="warning">
          <Sparkles class="mr-1 h-3 w-3" /> Trending
        </BaseBadge>
        <BaseBadge v-if="service.provider && SMM_PROVIDER_LABEL[service.provider]" tone="neutral" class="text-[10px]">
          {{ SMM_PROVIDER_LABEL[service.provider] ?? service.provider }}
        </BaseBadge>
        <BaseBadge tone="brand">{{ SERVICE_TYPE_LABEL[service.type] ?? service.type }}</BaseBadge>
      </div>
    </div>

    <h3 class="font-display mt-3 line-clamp-2 text-sm font-semibold text-ink">{{ service.name }}</h3>
    <p v-if="service.description" class="mt-1 line-clamp-2 text-xs leading-relaxed text-ink/45">
      {{ service.description }}
    </p>

    <div class="mt-3 flex items-baseline gap-1">
      <span class="font-display text-lg font-bold text-ink">
        {{ formatMoney(service.pricePerUnit, service.currency) }}
      </span>
      <span v-if="service.type === 'Package' || service.type === 'Custom Comments Package' || (service.min === 1 && service.max === 1)" class="text-xs text-ink/40">/ package</span>
      <span v-else class="text-xs text-ink/40">/ 1,000</span>
    </div>

    <div class="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink/50">
      <span>Min {{ service.min.toLocaleString() }}</span>
      <span>Max {{ service.max.toLocaleString() }}</span>
      <span v-if="service.deliveryTime" class="inline-flex items-center gap-1">
        <Clock class="h-3 w-3" /> {{ service.deliveryTime }}
      </span>
      <span v-if="service.refill" class="inline-flex items-center gap-1 text-emerald-300">
        <RefreshCcw class="h-3 w-3" /> Refill
      </span>
    </div>

    <BaseButton class="mt-4" block size="sm" @click="emit('buy', service)">Buy now</BaseButton>
  </div>
</template>
