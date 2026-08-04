<script setup lang="ts">
import { computed } from 'vue'
import {
  Camera,
  Clock,
  Music2,
  Play,
  RefreshCcw,
  Send,
  Sparkles,
  ThumbsUp,
} from '@lucide/vue'
import type { Service } from '@/types/models'
import { formatMoney } from '@/utils/format'
import { PLATFORM_META, SERVICE_TYPE_LABEL } from '@/utils/constants'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseBadge from '@/components/ui/BaseBadge.vue'

const props = defineProps<{ service: Service }>()
const emit = defineEmits<{ buy: [service: Service] }>()

const PLATFORM_ICONS = {
  facebook: ThumbsUp,
  tiktok: Music2,
  telegram: Send,
  youtube: Play,
  instagram: Camera,
  other: Sparkles,
} as const

function platformOf(service: Service) {
  const category = service.category
  if (category && typeof category === 'object' && 'platform' in category) {
    return PLATFORM_META[category.platform as keyof typeof PLATFORM_META] ?? PLATFORM_META.other
  }
  return PLATFORM_META.other
}

const platformKey = computed(() => {
  const category = props.service.category
  if (category && typeof category === 'object' && 'platform' in category) {
    return (category.platform as keyof typeof PLATFORM_ICONS) in PLATFORM_ICONS
      ? (category.platform as keyof typeof PLATFORM_ICONS)
      : 'other'
  }
  return 'other'
})
</script>

<template>
  <div
    class="group glass relative flex flex-col overflow-hidden rounded-2xl p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-brand-400/30 hover:shadow-glow"
  >
    <div
      class="pointer-events-none absolute -right-14 -top-14 h-40 w-40 rounded-full bg-gradient-to-br opacity-10 blur-2xl transition-opacity duration-300 group-hover:opacity-20"
      :class="platformOf(service).color"
    />

    <div class="flex items-start justify-between gap-3">
      <div
        class="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-lg transition-transform duration-300 group-hover:scale-110"
        :class="platformOf(service).color"
      >
        <component :is="PLATFORM_ICONS[platformKey]" class="h-6 w-6" />
      </div>
      <div class="flex flex-col items-end gap-1.5">
        <BaseBadge v-if="service.isFeatured" tone="warning">
          <Sparkles class="mr-1 h-3 w-3" /> Trending
        </BaseBadge>
        <BaseBadge tone="brand">{{ SERVICE_TYPE_LABEL[service.type] ?? service.type }}</BaseBadge>
      </div>
    </div>

    <h3 class="font-display mt-4 text-base font-semibold text-white">{{ service.name }}</h3>
    <p v-if="service.description" class="mt-1 line-clamp-2 text-xs leading-relaxed text-white/45">
      {{ service.description }}
    </p>

    <div class="mt-4 flex items-baseline gap-1">
      <span class="font-display text-xl font-bold text-white">
        {{ formatMoney(service.pricePerUnit * 1000, service.currency) }}
      </span>
      <span class="text-xs text-white/40">/ 1,000</span>
    </div>

    <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/50">
      <span>Min {{ service.min.toLocaleString() }}</span>
      <span>Max {{ service.max.toLocaleString() }}</span>
      <span v-if="service.deliveryTime" class="inline-flex items-center gap-1">
        <Clock class="h-3 w-3" /> {{ service.deliveryTime }}
      </span>
      <span v-if="service.refill" class="inline-flex items-center gap-1 text-emerald-300">
        <RefreshCcw class="h-3 w-3" /> Refill
      </span>
    </div>

    <BaseButton class="mt-5" block size="sm" @click="emit('buy', service)">Buy now</BaseButton>
  </div>
</template>
