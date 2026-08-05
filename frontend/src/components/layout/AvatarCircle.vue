<script setup lang="ts">
import { computed, ref, watch } from 'vue'

/**
 * Reusable user avatar: the Google profile photo inside a gradient circle,
 * falling back to gradient initials (dashboard-topbar style) when there is
 * no photo or the image fails to load.
 */
const props = withDefaults(
  defineProps<{
    name?: string
    email?: string
    avatarUrl?: string
    /** Circle diameter in pixels. */
    size?: number
  }>(),
  { name: '', email: '', avatarUrl: '', size: 36 },
)

const initials = computed(() => {
  const source = props.name || props.email || 'V'
  return source.slice(0, 2).toUpperCase()
})

const url = ref(props.avatarUrl ?? '')
watch(
  () => props.avatarUrl,
  (v) => {
    url.value = v ?? ''
  },
  { immediate: true },
)
</script>

<template>
  <span
    class="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-brand-500 to-secondary-500 font-bold text-white"
    :style="{
      width: `${size}px`,
      height: `${size}px`,
      fontSize: `${Math.max(10, Math.round(size / 3.2))}px`,
    }"
  >
    <img
      v-if="url"
      :src="url"
      :alt="name || 'Avatar'"
      class="h-full w-full rounded-full object-cover"
      @error="url = ''"
    />
    <span v-else>{{ initials }}</span>
  </span>
</template>
