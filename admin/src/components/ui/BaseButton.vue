<script setup lang="ts">
import { computed } from 'vue'

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
  primary: 'bg-gradient-to-r from-brand-500 to-brand-600 text-white hover:from-brand-400 hover:to-brand-500 shadow-glow',
  secondary: 'bg-gradient-to-r from-secondary-400 to-secondary-500 text-night font-semibold hover:from-secondary-300 hover:to-secondary-400',
  outline: 'border border-white/15 text-white hover:border-brand-400/60 hover:bg-brand-500/10',
  ghost: 'text-white/70 hover:text-white hover:bg-white/5',
  danger: 'bg-rose-500/90 text-white hover:bg-rose-500',
}

const sizeClasses: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-5 text-sm gap-2',
  lg: 'h-12 px-7 text-base gap-2',
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
    <svg v-if="loading" class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
      <path class="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
    <slot v-else />
  </button>
</template>
