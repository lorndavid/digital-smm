<script setup lang="ts">
import { ArrowLeft } from '@lucide/vue'
import BrandLogo from '@/components/layout/BrandLogo.vue'

export interface LegalSection {
  heading: string
  paragraphs: string[]
  list?: string[]
}

defineProps<{
  title: string
  updated: string
  sections: LegalSection[]
}>()
</script>

<template>
  <div class="min-h-screen">
    <header class="border-b border-ink/10 bg-card/40">
      <div class="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
        <RouterLink to="/" aria-label="DigitalSMM home"><BrandLogo /></RouterLink>
        <RouterLink
          to="/"
          class="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-ink/60 transition-colors hover:bg-ink/5 hover:text-ink"
        >
          <ArrowLeft class="h-4 w-4" /> Back to home
        </RouterLink>
      </div>
    </header>

    <main class="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6 sm:py-16">
      <p class="text-sm font-semibold uppercase tracking-widest text-brand-300">Legal</p>
      <h1 class="font-display mt-3 text-3xl font-bold tracking-tight text-ink sm:text-4xl">
        {{ title }}
      </h1>
      <p class="mt-3 text-sm text-ink/40">Last updated: {{ updated }}</p>

      <div class="mt-10 space-y-9">
        <section v-for="section in sections" :key="section.heading">
          <h2 class="font-display text-lg font-semibold text-ink">{{ section.heading }}</h2>
          <p
            v-for="(paragraph, index) in section.paragraphs"
            :key="index"
            class="mt-3 text-sm leading-relaxed text-ink/60"
          >
            {{ paragraph }}
          </p>
          <ul
            v-if="section.list"
            class="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink/60"
          >
            <li v-for="item in section.list" :key="item">{{ item }}</li>
          </ul>
        </section>
      </div>
    </main>

    <footer class="border-t border-ink/10 bg-card/40 py-6 text-center text-xs text-ink/40">
      © {{ new Date().getFullYear() }} DigitalSMM. All rights reserved.
    </footer>
  </div>
</template>
