<script setup lang="ts">
import { ref } from 'vue'
import { ChevronDown } from '@lucide/vue'

export interface FaqItem {
  question: string
  answer: string
}

withDefaults(defineProps<{ title?: string; items: FaqItem[] }>(), {
  title: 'Frequently asked questions',
})

const open = ref<number | null>(0)

function toggle(index: number): void {
  open.value = open.value === index ? null : index
}
</script>

<template>
  <section class="py-8">
    <div class="container-page max-w-3xl">
      <h2 class="font-display text-xl font-bold text-ink sm:text-2xl">{{ title }}</h2>
      <div class="mt-5 space-y-3">
        <div v-for="(item, index) in items" :key="item.question" data-seo-faq-item class="glass overflow-hidden rounded-xl">
          <button
            class="flex w-full items-center justify-between gap-3 px-5 py-4 text-left text-sm font-semibold text-ink"
            :aria-expanded="open === index"
            @click="toggle(index)"
          >
            {{ item.question }}
            <ChevronDown
              class="h-4 w-4 shrink-0 text-ink/40 transition-transform"
              :class="open === index ? 'rotate-180' : ''"
            />
          </button>
          <div v-if="open === index" class="px-5 pb-4 text-sm leading-relaxed text-ink/60">
            {{ item.answer }}
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
