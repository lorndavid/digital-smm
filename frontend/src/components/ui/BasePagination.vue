<script setup lang="ts">
import { computed } from 'vue'
import { ChevronLeft, ChevronRight } from '@lucide/vue'

const props = defineProps<{ page: number; total: number; limit: number }>()
const emit = defineEmits<{ change: [page: number] }>()

const totalPages = computed(() => Math.max(1, Math.ceil(props.total / Math.max(1, props.limit))))

function go(page: number): void {
  if (page >= 1 && page <= totalPages.value && page !== props.page) {
    emit('change', page)
  }
}
</script>

<template>
  <div v-if="totalPages > 1" class="flex items-center justify-center gap-2 pt-3">
    <button
      class="flex h-8 w-8 items-center justify-center rounded-lg border border-ink/10 text-ink/70 transition-colors hover:border-brand-400/50 hover:text-ink disabled:opacity-30 disabled:pointer-events-none"
      :disabled="page <= 1"
      aria-label="Previous page"
      @click="go(page - 1)"
    >
      <ChevronLeft class="h-4 w-4" />
    </button>
    <span class="text-sm text-ink/50">
      Page <span class="font-semibold text-ink">{{ page }}</span> of {{ totalPages }}
    </span>
    <button
      class="flex h-8 w-8 items-center justify-center rounded-lg border border-ink/10 text-ink/70 transition-colors hover:border-brand-400/50 hover:text-ink disabled:opacity-30 disabled:pointer-events-none"
      :disabled="page >= totalPages"
      aria-label="Next page"
      @click="go(page + 1)"
    >
      <ChevronRight class="h-4 w-4" />
    </button>
  </div>
</template>
