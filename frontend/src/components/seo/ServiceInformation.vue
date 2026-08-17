<script setup lang="ts">
import { Clock, MinusCircle, RotateCcw } from '@lucide/vue'

interface InfoRow {
  label: string
  value: string
}

withDefaults(
  defineProps<{
    title?: string
    rows: InfoRow[]
  }>(),
  { title: 'Service information' },
)
</script>

<template>
  <section class="py-8">
    <div class="container-page">
      <h2 class="font-display text-xl font-bold text-ink sm:text-2xl">{{ title }}</h2>
      <dl data-seo-info-table class="glass mt-5 divide-y divide-ink/[0.06] overflow-hidden rounded-2xl">
        <div v-for="row in rows" :key="row.label" class="flex items-center justify-between gap-4 px-5 py-3.5 text-sm">
          <dt class="text-ink/50">{{ row.label }}</dt>
          <dd class="font-medium text-ink">{{ row.value }}</dd>
        </div>
      </dl>
      <div class="mt-4 flex flex-wrap gap-4 text-xs text-ink/40">
        <span v-if="rows.some((r) => r.label.includes('Refill'))" class="inline-flex items-center gap-1">
          <RotateCcw class="h-3.5 w-3.5" /> Refill supported where marked
        </span>
        <span v-if="rows.some((r) => r.label.includes('Cancel'))" class="inline-flex items-center gap-1">
          <MinusCircle class="h-3.5 w-3.5" /> Cancellation where marked
        </span>
        <span class="inline-flex items-center gap-1">
          <Clock class="h-3.5 w-3.5" /> Start times are estimates from the provider
        </span>
      </div>
    </div>
  </section>
</template>
