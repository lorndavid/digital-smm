<script setup lang="ts">
withDefaults(defineProps<{ hover?: boolean; padding?: string; interactive?: boolean }>(), {
  hover: true,
  padding: 'p-5',
  interactive: false,
})
</script>

<template>
  <div
    class="glass rounded-xl shadow-card transition-all duration-300"
    :class="[
      padding,
      interactive ? 'cursor-pointer' : '',
      hover ? 'hover:-translate-y-0.5 hover:border-brand-400/30 hover:shadow-glow' : '',
    ]"
  >
    <slot />
  </div>
</template>
