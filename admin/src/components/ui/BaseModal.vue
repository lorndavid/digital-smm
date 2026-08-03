<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { X } from '@lucide/vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    title?: string
    maxWidth?: string
    closeOnBackdrop?: boolean
  }>(),
  { maxWidth: 'max-w-lg', closeOnBackdrop: true },
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
        <div class="absolute inset-0 bg-night/80 backdrop-blur-sm" @click="closeOnBackdrop && emit('close')" />
        <div
          class="glass-strong animate-scale-in relative max-h-[90vh] w-full overflow-y-auto rounded-3xl shadow-glow"
          :class="maxWidth"
        >
          <div
            v-if="title || $slots.header"
            class="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-night-soft/80 px-6 py-4 backdrop-blur-xl"
          >
            <slot name="header">
              <h3 class="font-display text-lg font-semibold text-white">{{ title }}</h3>
            </slot>
            <button
              class="flex h-8 w-8 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Close"
              @click="emit('close')"
            >
              <X class="h-4 w-4" />
            </button>
          </div>
          <div class="p-6">
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
.animate-scale-in {
  animation: scale-in 0.35s cubic-bezier(0.22, 1, 0.36, 1) both;
}
@keyframes scale-in {
  from {
    opacity: 0;
    transform: scale(0.96);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
