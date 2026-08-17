<script setup lang="ts">
import { CheckCircle2 } from '@lucide/vue'

defineProps<{
  title: string
  benefits: string[]
}>()
</script>

<template>
  <section class="py-8">
    <div class="container-page">
      <h2 class="font-display text-center text-xl font-bold text-ink sm:text-2xl">{{ title }}</h2>
      <ul class="mx-auto mt-6 grid max-w-4xl gap-3 sm:grid-cols-2">
        <li
          v-for="benefit in benefits"
          :key="benefit"
          class="glass flex items-start gap-3 rounded-xl p-4 text-sm text-ink/70"
        >
          <CheckCircle2 class="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          {{ benefit }}
        </li>
      </ul>
    </div>
  </section>
</template>
