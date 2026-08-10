<script setup lang="ts">
import { computed } from 'vue'
import { Moon, Sun } from '@lucide/vue'
import { useThemeStore } from '@/stores/theme.store'

const themeStore = useThemeStore()

const isDark = computed(() => themeStore.theme === 'dark')
const label = computed(() => (isDark.value ? 'Switch to light mode' : 'Switch to dark mode'))
</script>

<template>
  <button
    class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-soft text-ink-soft transition-all duration-200 hover:border-brand-400/50 hover:text-brand-600 dark:hover:text-brand-300 active:scale-95"
    :aria-label="label"
    :title="label"
    @click="themeStore.toggle()"
  >
    <Sun v-if="isDark" class="h-[18px] w-[18px]" />
    <Moon v-else class="h-[18px] w-[18px]" />
  </button>
</template>
