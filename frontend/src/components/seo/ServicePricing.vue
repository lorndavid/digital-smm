<script setup lang="ts">
import { ArrowRight } from '@lucide/vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import { formatMoney } from '@/utils/format'
import type { Service } from '@/types/models'

withDefaults(
  defineProps<{
    title?: string
    services: Service[]
    /** Route to a single service's landing page. */
    linkBase?: string
    ctaLabel?: string
  }>(),
  {
    title: 'Popular services & pricing',
    linkBase: '/service/',
    ctaLabel: 'View & order',
  },
)
</script>

<template>
  <section class="py-8">
    <div class="container-page">
      <h2 class="font-display text-xl font-bold text-ink sm:text-2xl">{{ title }}</h2>
      <div class="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="service in services"
          :key="service._id"
          data-seo-pricing-card
          class="glass flex flex-col justify-between gap-4 rounded-2xl p-5 shadow-card"
        >
          <div>
            <p class="line-clamp-2 text-sm font-semibold text-ink">{{ service.name }}</p>
            <p class="mt-2 text-[13px] text-ink/50">
              From <strong class="text-ink">{{ formatMoney(service.pricePerUnit) }}</strong> / 1,000
            </p>
            <p class="mt-1 text-xs text-ink/40">
              Min {{ service.min?.toLocaleString?.() ?? service.min }} · Max {{ service.max?.toLocaleString?.() ?? service.max }}
            </p>
          </div>
          <RouterLink :to="`${linkBase}${service._id}`">
            <BaseButton variant="outline" size="sm">
              {{ ctaLabel }} <ArrowRight class="h-3.5 w-3.5" />
            </BaseButton>
          </RouterLink>
        </div>
      </div>
    </div>
  </section>
</template>
