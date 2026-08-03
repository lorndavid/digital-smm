<script setup lang="ts">
import type { Component } from 'vue'
import { AlertTriangle, CheckCircle2, Info, XCircle } from '@lucide/vue'
import { useToastStore, type ToastType } from '@/stores/toast.store'

const store = useToastStore()

const icons: Record<ToastType, Component> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
}

const styles: Record<ToastType, string> = {
  success: 'border-emerald-400/40',
  error: 'border-rose-400/40',
  warning: 'border-amber-400/40',
  info: 'border-sky-400/40',
}

const iconColors: Record<ToastType, string> = {
  success: 'text-emerald-300',
  error: 'text-rose-300',
  warning: 'text-amber-300',
  info: 'text-sky-300',
}
</script>

<template>
  <div
    class="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4"
  >
    <TransitionGroup name="toast">
      <div
        v-for="toast in store.toasts"
        :key="toast.id"
        class="glass-strong animate-scale-in pointer-events-auto flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-glow"
        :class="styles[toast.type]"
      >
        <component :is="icons[toast.type]" class="h-5 w-5 shrink-0" :class="iconColors[toast.type]" />
        <span class="text-sm font-medium text-white">{{ toast.message }}</span>
        <button
          class="ml-1 text-white/40 transition-colors hover:text-white"
          aria-label="Dismiss"
          @click="store.dismiss(toast.id)"
        >
          ×
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.25s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.96);
}
</style>
