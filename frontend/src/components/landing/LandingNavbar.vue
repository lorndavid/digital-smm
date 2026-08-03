<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { Menu, X } from '@lucide/vue'
import { useAuthStore } from '@/stores/auth.store'
import BrandLogo from '../layout/BrandLogo.vue'
import BaseButton from '@/components/ui/BaseButton.vue'

const router = useRouter()
const authStore = useAuthStore()

const scrolled = ref(false)
const mobileOpen = ref(false)

function onScroll(): void {
  scrolled.value = window.scrollY > 24
}
onMounted(() => {
  onScroll()
  window.addEventListener('scroll', onScroll)
})
onUnmounted(() => window.removeEventListener('scroll', onScroll))

const links = [
  { label: 'Home', href: '#home' },
  { label: 'Services', href: '#services' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
  { label: 'Contact', href: '#contact' },
]
</script>

<template>
  <header
    class="fixed inset-x-0 top-0 z-40 transition-all duration-300"
    :class="scrolled || mobileOpen ? 'glass-strong border-b border-white/10' : ''"
  >
    <nav class="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
      <a href="#home" class="shrink-0"><BrandLogo /></a>

      <div class="hidden items-center gap-8 lg:flex">
        <a
          v-for="link in links"
          :key="link.label"
          :href="link.href"
          class="text-sm font-medium text-white/60 transition-colors hover:text-white"
        >
          {{ link.label }}
        </a>
      </div>

      <div class="hidden items-center gap-3 lg:flex">
        <template v-if="authStore.isSignedIn">
          <BaseButton variant="primary" @click="router.push('/dashboard')">Dashboard</BaseButton>
        </template>
        <template v-else>
          <BaseButton variant="ghost" @click="router.push('/sign-in')">Sign In</BaseButton>
          <BaseButton variant="primary" @click="router.push('/sign-in')">Get Started</BaseButton>
        </template>
      </div>

      <button
        class="flex h-10 w-10 items-center justify-center rounded-xl text-white/80 lg:hidden"
        aria-label="Toggle menu"
        @click="mobileOpen = !mobileOpen"
      >
        <Menu v-if="!mobileOpen" class="h-6 w-6" />
        <X v-else class="h-6 w-6" />
      </button>
    </nav>

    <Transition name="dropdown">
      <div
        v-if="mobileOpen"
        class="glass-strong border-t border-white/10 px-4 pb-6 pt-3 lg:hidden"
      >
        <div class="flex flex-col gap-4">
          <a
            v-for="link in links"
            :key="link.label"
            :href="link.href"
            class="text-sm font-medium text-white/70 transition-colors hover:text-white"
            @click="mobileOpen = false"
          >
            {{ link.label }}
          </a>
          <div class="mt-2 flex gap-3">
            <BaseButton variant="outline" block @click="router.push('/sign-in')">Sign In</BaseButton>
            <BaseButton variant="primary" block @click="router.push('/sign-in')">Get Started</BaseButton>
          </div>
        </div>
      </div>
    </Transition>
  </header>
</template>

<style>
.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.2s ease;
}
.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
