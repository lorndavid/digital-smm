<script setup lang="ts">
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
    <span v-if="label" class="mb-1.5 block text-sm font-medium text-(--a-text-soft)">{{ label }}</span>
    <select
      :value="modelValue"
      :disabled="disabled"
      class="h-11 w-full appearance-none rounded-xl border bg-(--a-soft) px-4 text-sm text-(--a-text) transition-colors focus:border-brand-400/60 focus:outline-none focus:ring-2 focus:ring-brand-400/30 disabled:opacity-50 [&>option]:bg-(--a-option-bg)"
      :class="error ? 'border-rose-400/60' : 'border-(--a-border)'"
      @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <option v-for="opt in options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
      <slot />
    </select>
    <span v-if="error" class="mt-1 block text-xs text-rose-300">{{ error }}</span>
  </label>
</template>
