<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { X } from '@lucide/vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    title?: string
    maxWidth?: string
    closeOnBackdrop?: boolean
    hideHeader?: boolean
  }>(),
  { maxWidth: 'max-w-lg', closeOnBackdrop: true, hideHeader: false },
)

const emit = defineEmits<{ close: [] }>()

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && props.open) emit('close')
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          class="absolute inset-0 bg-black/60 backdrop-blur-sm"
          @click="closeOnBackdrop && emit('close')"
        />
        <div
          class="animate-scale-in glass-strong relative max-h-[90vh] w-full overflow-y-auto rounded-2xl shadow-glow"
          :class="maxWidth"
        >
          <div
            v-if="!hideHeader && (title || $slots.header)"
            class="sticky top-0 z-10 flex items-center justify-between border-b border-ink/10 bg-card/80 px-5 py-3 backdrop-blur-xl"
          >
            <slot name="header">
              <h3 class="font-display text-base font-semibold text-ink">{{ title }}</h3>
            </slot>
            <button
              class="flex h-8 w-8 items-center justify-center rounded-lg text-ink/50 transition-colors hover:bg-ink/10 hover:text-ink"
              aria-label="Close"
              @click="emit('close')"
            >
              <X class="h-4 w-4" />
            </button>
          </div>
          <div class="p-5">
            <slot />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
