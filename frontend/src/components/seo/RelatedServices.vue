<script setup lang="ts">
import { ArrowRight } from '@lucide/vue'
import type { Service } from '@/types/models'

withDefaults(
  defineProps<{
    title?: string
    services: Service[]
    linkBase?: string
  }>(),
  { title: 'Related services', linkBase: '/service/' },
)
</script>

<template>
  <section v-if="services.length" data-seo-related class="py-8">
    <div class="container-page">
      <h2 class="font-display text-xl font-bold text-ink sm:text-2xl">{{ title }}</h2>
      <div class="mt-5 flex flex-wrap gap-2.5">
        <RouterLink
          v-for="service in services"
          :key="service._id"
          :to="`${linkBase}${service._id}`"
          class="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-ink/5 px-4 py-2 text-[13px] font-medium text-ink/70 transition-all hover:border-brand-400/50 hover:text-ink"
        >
          {{ service.name }}
          <ArrowRight class="h-3 w-3 text-ink/30" />
        </RouterLink>
      </div>
    </div>
  </section>
</template>
