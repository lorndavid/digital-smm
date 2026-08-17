<script setup lang="ts">
defineProps<{ title: string; body: string }>()
</script>

<template>
  <section class="py-10">
    <div class="container-page grid gap-6 lg:grid-cols-[1fr_2fr]">
      <h2 class="font-display text-xl font-bold text-ink sm:text-2xl">{{ title }}</h2>
      <div class="prose-seo text-[15px] leading-relaxed text-ink/60">
        <p>{{ body }}</p>
        <slot />
      </div>
    </div>
  </section>
</template>
