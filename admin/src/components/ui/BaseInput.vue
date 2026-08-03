<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue?: string | number | null
    label?: string
    error?: string
    hint?: string
    placeholder?: string
    type?: string
    disabled?: boolean
    min?: number | string
    max?: number | string
    step?: number | string
  }>(),
  { modelValue: '', type: 'text', disabled: false },
)

const emit = defineEmits<{ 'update:modelValue': [value: string | number] }>()
</script>

<template>
  <label class="block">
    <span v-if="label" class="mb-1.5 block text-sm font-medium text-white/80">{{ label }}</span>
    <input
      :value="modelValue"
      :type="type"
      :placeholder="placeholder"
      :disabled="disabled"
      :min="min"
      :max="max"
      :step="step"
      class="h-11 w-full rounded-xl border bg-white/5 px-4 text-sm text-white placeholder:text-white/30 transition-colors focus:border-brand-400/60 focus:outline-none focus:ring-2 focus:ring-brand-400/30 disabled:opacity-50"
      :class="error ? 'border-rose-400/60' : 'border-white/10'"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <span v-if="hint && !error" class="mt-1 block text-xs text-white/40">{{ hint }}</span>
    <span v-if="error" class="mt-1 block text-xs text-rose-300">{{ error }}</span>
  </label>
</template>
