<script setup lang="ts">
defineProps<{ modelValue?: boolean; label: string }>()
defineEmits<{ 'update:modelValue': [boolean] }>()
</script>

<template>
  <div class="flex items-center justify-between gap-4">
    <span class="text-sm text-white/80">{{ label }}</span>
    <button
      type="button"
      role="switch"
      :aria-checked="Boolean(modelValue)"
      class="relative h-6 w-11 shrink-0 rounded-full transition-colors"
      :class="modelValue ? 'bg-gradient-to-r from-brand-500 to-secondary-500' : 'bg-white/10'"
      @click="$emit('update:modelValue', !modelValue)"
    >
      <span
        class="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all"
        :class="modelValue ? 'left-[22px]' : 'left-0.5'"
      />
    </button>
  </div>
</template>
