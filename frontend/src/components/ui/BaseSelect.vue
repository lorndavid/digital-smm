<script setup lang="ts">
import { ChevronDown } from '@lucide/vue'

withDefaults(
  defineProps<{
    modelValue?: string
    label?: string
    error?: string
    disabled?: boolean
    options?: Array<{ value: string; label: string }>
  }>(),
  { modelValue: '', disabled: false, options: () => [] },
)

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <label class="block">
    <span v-if="label" class="mb-1.5 block text-sm font-medium text-ink/80">{{ label }}</span>
    <div class="relative">
      <select
        :value="modelValue"
        :disabled="disabled"
        class="h-11 w-full appearance-none rounded-xl border bg-soft px-4 pr-10 text-sm text-ink transition-colors focus:border-brand-400/60 focus:outline-none focus:ring-2 focus:ring-brand-400/30 disabled:opacity-50 [&>option]:bg-card"
        :class="error ? 'border-rose-400/60' : 'border-ink/10'"
        @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
      >
        <option v-if="options.length === 0" value="" disabled hidden>Select an option</option>
        <option v-for="opt in options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        <slot v-if="options.length === 0" />
      </select>
      <ChevronDown class="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" />
    </div>
    <span v-if="error" class="mt-1 block text-xs text-rose-300">{{ error }}</span>
  </label>
</template>
