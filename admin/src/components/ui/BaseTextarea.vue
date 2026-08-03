<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue?: string
    label?: string
    error?: string
    placeholder?: string
    rows?: number | string
    disabled?: boolean
  }>(),
  { modelValue: '', rows: 4, disabled: false },
)

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <label class="block">
    <span v-if="label" class="mb-1.5 block text-sm font-medium text-(--a-text-soft)">{{ label }}</span>
    <textarea
      :value="modelValue"
      :rows="rows"
      :placeholder="placeholder"
      :disabled="disabled"
      class="w-full resize-y rounded-xl border bg-(--a-soft) px-4 py-3 text-sm text-(--a-text) placeholder:text-(--a-muted-3) transition-colors focus:border-brand-400/60 focus:outline-none focus:ring-2 focus:ring-brand-400/30 disabled:opacity-50"
      :class="error ? 'border-rose-400/60' : 'border-(--a-border)'"
      @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    />
    <span v-if="error" class="mt-1 block text-xs text-rose-300">{{ error }}</span>
  </label>
</template>
