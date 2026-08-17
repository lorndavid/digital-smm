<script setup lang="ts">
import { ChevronRight } from '@lucide/vue'

interface Crumb {
  label: string
  to?: string
}

defineProps<{ items: Crumb[] }>()
</script>

<template>
  <nav aria-label="Breadcrumb" data-seo-breadcrumbs class="flex flex-wrap items-center gap-1 text-[13px] text-ink/50">
    <RouterLink to="/" class="transition-colors hover:text-ink">Home</RouterLink>
    <template v-for="(item, index) in items" :key="index">
      <ChevronRight class="h-3.5 w-3.5 text-ink/30" aria-hidden="true" />
      <RouterLink
        v-if="item.to"
        :to="item.to"
        class="transition-colors hover:text-ink"
      >
        {{ item.label }}
      </RouterLink>
      <span v-else class="font-medium text-ink" :aria-current="'page'">{{ item.label }}</span>
    </template>
  </nav>
</template>
