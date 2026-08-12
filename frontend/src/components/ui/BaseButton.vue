<script setup lang="ts">
import { computed } from 'vue'
import BaseSpinner from './BaseSpinner.vue'

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const props = withDefaults(
  defineProps<{
    variant?: Variant
    size?: Size
    disabled?: boolean
    loading?: boolean
    block?: boolean
    type?: 'button' | 'submit'
  }>(),
  { variant: 'primary', size: 'md', disabled: false, loading: false, block: false, type: 'button' },
)

const emit = defineEmits<{ click: [event: MouseEvent] }>()

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-gradient-to-r from-brand-500 to-brand-600 text-white hover:from-brand-400 hover:to-brand-500 shadow-glow',
  secondary:
    'bg-gradient-to-r from-secondary-400 to-secondary-500 text-night font-semibold hover:from-secondary-300 hover:to-secondary-400 shadow-[0_0_30px_-6px_rgba(0,229,255,0.5)]',
  outline: 'border border-ink/15 text-ink hover:border-brand-400/60 hover:bg-brand-500/10',
  ghost: 'text-ink/70 hover:text-ink hover:bg-ink/5',
  danger: 'bg-rose-500/90 text-white hover:bg-rose-500',
}

const sizeClasses: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-3.5 text-[13px] gap-1.5',
  lg: 'h-11 px-5 text-sm gap-2',
}

const classes = computed(() => [
  'inline-flex items-center justify-center rounded-xl font-semibold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98] cursor-pointer select-none',
  variantClasses[props.variant],
  sizeClasses[props.size],
  props.block ? 'w-full' : '',
])
</script>

<template>
  <button :type="type" :class="classes" :disabled="disabled || loading" @click="emit('click', $event)">
    <BaseSpinner v-if="loading" class="h-4 w-4" />
    <slot v-else />
  </button>
</template>
