<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Menu, Package, Settings, User, Wallet, X } from '@lucide/vue'
import { useAuthStore } from '@/stores/auth.store'
import { useWalletStore } from '@/stores/wallet.store'
import { formatMoney } from '@/utils/format'
import AvatarCircle from '../layout/AvatarCircle.vue'
import AccountMenu from '../layout/AccountMenu.vue'
import BrandLogo from '../layout/BrandLogo.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import ThemeToggle from '@/components/ui/ThemeToggle.vue'

const router = useRouter()
const authStore = useAuthStore()
const walletStore = useWalletStore()

const scrolled = ref(false)
const mobileOpen = ref(false)

function onScroll(): void {
  scrolled.value = window.scrollY > 24
}
onMounted(() => {
  onScroll()
  window.addEventListener('scroll', onScroll)
})
onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
})

const links = [
  { label: 'Home', href: '#home' },
  { label: 'Services', href: '#services' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'FAQ', href: '#faq' },
  { label: 'Contact', href: '#contact' },
]

function go(to: string): void {
  mobileOpen.value = false
  void router.push(to)
}

async function onSignOut(): Promise<void> {
  mobileOpen.value = false
  await authStore.signOut()
  void router.push('/')
}

// Load the wallet once the user is signed in (drives the balance chip).
watch(
  () => authStore.isSignedIn,
  (signedIn) => {
    if (signedIn) void walletStore.fetchWallet().catch(() => undefined)
  },
  { immediate: true },
)

/** Account dropdown shortcuts (modern SaaS pattern). */
const profileItems = [
  { label: 'Profile', to: '/dashboard/profile', icon: User },
  { label: 'Wallet', to: '/dashboard/wallet', icon: Wallet },
  { label: 'Orders', to: '/dashboard/orders', icon: Package },
  { label: 'Settings', to: '/dashboard/settings', icon: Settings },
]
</script>

<template>
  <header
    class="fixed inset-x-0 top-0 z-40 transition-all duration-300"
    :class="scrolled || mobileOpen ? 'glass-strong border-b border-ink/10' : ''"
  >
    <nav class="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
      <a href="#home" class="shrink-0"><BrandLogo /></a>

      <div class="hidden items-center gap-8 lg:flex">
        <a
          v-for="link in links"
          :key="link.label"
          :href="link.href"
          class="text-sm font-medium text-ink/60 transition-colors hover:text-ink"
        >
          {{ link.label }}
        </a>
      </div>

      <div class="hidden items-center gap-3 lg:flex">
        <ThemeToggle />
        <!-- Wait for session rehydration so a logged-in user never sees the
             wrong (sign-in) buttons flash on revisit. -->
        <template v-if="authStore.isLoaded && authStore.isSignedIn">
          <AccountMenu />
          <!-- Wallet balance chip, next to the avatar -->
          <button
            class="flex items-center gap-1.5 rounded-full border border-ink/10 bg-ink/5 px-3 py-2 text-sm font-semibold text-ink/85 transition-colors hover:border-emerald-400/40 hover:bg-ink/10"
            aria-label="Wallet balance"
            @click="go('/dashboard/wallet')"
          >
            <Wallet class="h-3.5 w-3.5 text-emerald-300" />
            {{
              walletStore.loading && !walletStore.wallet
                ? '…'
                : formatMoney(walletStore.wallet?.balance ?? 0)
            }}
          </button>
          <BaseButton variant="primary" @click="go('/dashboard')">Dashboard</BaseButton>
        </template>
        <template v-else-if="authStore.isLoaded">
          <BaseButton variant="ghost" @click="router.push('/sign-in')">Sign In</BaseButton>
          <BaseButton variant="primary" @click="router.push('/sign-in')">Get Started</BaseButton>
        </template>
      </div>

      <div class="flex items-center gap-2 lg:hidden">
        <ThemeToggle />
        <button
          class="flex h-10 w-10 items-center justify-center rounded-xl text-ink/80 transition-colors hover:bg-ink/5"
          aria-label="Toggle menu"
          @click="mobileOpen = !mobileOpen"
        >
          <Menu v-if="!mobileOpen" class="h-6 w-6" />
          <X v-else class="h-6 w-6" />
        </button>
      </div>
    </nav>

    <Transition name="dropdown">
      <div
        v-if="mobileOpen"
        class="glass-strong border-t border-ink/10 px-4 pb-6 pt-3 lg:hidden"
      >
        <div class="flex flex-col gap-4">
          <a
            v-for="link in links"
            :key="link.label"
            :href="link.href"
            class="text-sm font-medium text-ink/70 transition-colors hover:text-ink"
            @click="mobileOpen = false"
          >
            {{ link.label }}
          </a>
          <!-- Same isLoaded guard as the desktop row: a returning signed-in
               user must never see the sign-in buttons flash on revisit. -->
          <template v-if="authStore.isLoaded && authStore.isSignedIn">              <div class="flex items-center gap-3">
                <AvatarCircle
                  :name="authStore.user?.name ?? ''"
                  :email="authStore.user?.email ?? ''"
                  :avatar-url="authStore.user?.avatarUrl ?? ''"
                  :size="40"
                />
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-semibold text-ink">
                    {{ authStore.user?.name || 'VidSMM User' }}
                  </p>
                  <p class="truncate text-xs text-ink/40">{{ authStore.user?.email ?? '' }}</p>
                </div>
                <button
                  class="flex shrink-0 items-center gap-1 rounded-full border border-ink/10 bg-ink/5 px-2.5 py-1.5 text-xs font-semibold text-ink/85"
                  aria-label="Wallet balance"
                  @click="go('/dashboard/wallet')"
                >
                  <Wallet class="h-3.5 w-3.5 text-emerald-300" />
                  {{
                    walletStore.loading && !walletStore.wallet
                      ? '…'
                      : formatMoney(walletStore.wallet?.balance ?? 0)
                  }}
                </button>
              </div>
            <div class="grid grid-cols-2 gap-2">
              <button
                v-for="item in profileItems"
                :key="item.to"
                class="flex items-center gap-2 rounded-xl bg-ink/5 px-3 py-2 text-sm font-medium text-ink/70 transition-colors hover:bg-ink/10 hover:text-ink"
                @click="go(item.to)"
              >
                <component :is="item.icon" class="h-4 w-4 text-ink/50" />
                {{ item.label }}
              </button>
            </div>
            <div class="mt-1 flex gap-3">
              <BaseButton variant="outline" block @click="onSignOut">Sign Out</BaseButton>
              <BaseButton variant="primary" block @click="go('/dashboard')">Dashboard</BaseButton>
            </div>
          </template>
          <template v-else-if="authStore.isLoaded">
            <div class="flex gap-3">
              <BaseButton variant="outline" block @click="router.push('/sign-in')">Sign In</BaseButton>
              <BaseButton variant="primary" block @click="router.push('/sign-in')">Get Started</BaseButton>
            </div>
          </template>
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
.profile-enter-active,
.profile-leave-active {
  transition: all 0.18s ease;
}
.profile-enter-from,
.profile-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
}
</style>
