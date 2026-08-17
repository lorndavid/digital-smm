<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight, Menu, Package, Settings, User, Wallet, X } from '@lucide/vue'
import { useAuthStore } from '@/stores/auth.store'
import { useWalletStore } from '@/stores/wallet.store'
import { formatMoney } from '@/utils/format'
import AvatarCircle from '../layout/AvatarCircle.vue'
import AccountMenu from '../layout/AccountMenu.vue'
import BrandLogo from '../layout/BrandLogo.vue'
import PromoMarquee from '../layout/PromoMarquee.vue'
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
  window.addEventListener('scroll', onScroll, { passive: true })
})
onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
})

// Section links scroll in-page. 'Services' is auth-aware: signed-in users go
// to their ordering console (/dashboard/services); signed-out visitors get the
// public SEO catalogue (/services) so they can browse before creating an
// account. Both destinations are guarded appropriately by the router.
const links = computed<{ label: string; href?: string; to?: string }[]>(() => [
  { label: 'Home', href: '#home' },
  {
    label: 'Services',
    to: authStore.isSignedIn ? '/dashboard/services' : '/services',
  },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'FAQ', href: '#faq' },
  { label: 'Contact', href: '#contact' },
])

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
    :class="scrolled || mobileOpen ? 'glass-strong border-b border-line shadow-card' : ''"
  >
    <!-- Infinite promotional ticker — visible at the top of the welcome page,
         slides away as soon as the user scrolls down so only the navbar stays. -->
    <div
      class="overflow-hidden transition-[max-height] duration-300 ease-out"
      :class="scrolled ? 'max-h-0' : 'max-h-10'"
    >
      <PromoMarquee />
    </div>

    <nav class="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
      <a href="#home" class="shrink-0" aria-label="DigitalSMM home"><BrandLogo size="sm" /></a>

      <div class="hidden items-center gap-1 lg:flex">
        <template v-for="link in links" :key="link.label">
          <RouterLink
            v-if="link.to"
            :to="link.to"
            class="rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {{ link.label }}
          </RouterLink>
          <a
            v-else
            :href="link.href"
            class="rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {{ link.label }}
          </a>
        </template>
      </div>

      <div class="hidden items-center gap-2 lg:flex">
        <ThemeToggle />
        <!-- Wait for session rehydration so a logged-in user never sees the
             wrong (sign-in) buttons flash on revisit. -->
        <template v-if="authStore.isLoaded && authStore.isSignedIn">
          <!-- Wallet balance chip, next to the avatar -->
          <button
            class="flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-2 text-sm font-semibold text-foreground shadow-sm transition-colors hover:border-primary/40 hover:bg-muted"
            aria-label="Wallet balance"
            @click="go('/dashboard/wallet')"
          >
            <Wallet class="h-3.5 w-3.5 text-emerald-500" />
            {{
              walletStore.loading && !walletStore.wallet
                ? '…'
                : formatMoney(walletStore.wallet?.balance ?? 0)
            }}
          </button>
          <AccountMenu />
          <BaseButton variant="primary" @click="go('/dashboard')">
            Dashboard <ArrowRight class="h-4 w-4" />
          </BaseButton>
        </template>
        <template v-else-if="authStore.isLoaded">
          <BaseButton variant="ghost" @click="router.push('/sign-in')">Sign In</BaseButton>
          <BaseButton variant="primary" @click="router.push('/sign-in')">
            Get Started <ArrowRight class="h-4 w-4" />
          </BaseButton>
        </template>
      </div>

      <div class="flex items-center gap-2 lg:hidden">
        <ThemeToggle />
        <button
          class="flex h-9 w-9 items-center justify-center rounded-lg text-foreground/80 transition-colors hover:bg-muted"
          aria-label="Toggle menu"
          @click="mobileOpen = !mobileOpen"
        >
          <Menu v-if="!mobileOpen" class="h-5 w-5" />
          <X v-else class="h-5 w-5" />
        </button>
      </div>
    </nav>

    <Transition name="dropdown">
      <div
        v-if="mobileOpen"
        class="glass-strong border-t border-line px-4 pb-4 pt-2 lg:hidden"
      >
        <div class="flex flex-col gap-1">
          <template v-for="link in links" :key="link.label">
            <RouterLink
              v-if="link.to"
              :to="link.to"
              class="rounded-lg px-3 py-2 text-[13px] font-medium text-foreground/75 transition-colors hover:bg-muted hover:text-foreground"
              @click="mobileOpen = false"
            >
              {{ link.label }}
            </RouterLink>
            <a
              v-else
              :href="link.href"
              class="rounded-lg px-3 py-2 text-[13px] font-medium text-foreground/75 transition-colors hover:bg-muted hover:text-foreground"
              @click="mobileOpen = false"
            >
              {{ link.label }}
            </a>
          </template>

          <!-- Same isLoaded guard as the desktop row: a returning signed-in
               user must never see the sign-in buttons flash on revisit. -->
          <template v-if="authStore.isLoaded && authStore.isSignedIn">
            <div class="mt-3 flex items-center gap-3 rounded-2xl border border-line bg-card p-3">
              <AvatarCircle
                :name="authStore.user?.name ?? ''"
                :email="authStore.user?.email ?? ''"
                :avatar-url="authStore.user?.avatarUrl ?? ''"
                :size="40"
              />
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-semibold text-foreground">
                  {{ authStore.user?.name || 'DigitalSMM User' }}
                </p>
                <p class="truncate text-xs text-muted-foreground">{{ authStore.user?.email ?? '' }}</p>
              </div>
              <button
                class="flex shrink-0 items-center gap-1 rounded-full border border-line bg-muted px-2.5 py-1.5 text-xs font-semibold text-foreground"
                aria-label="Wallet balance"
                @click="go('/dashboard/wallet')"
              >
                <Wallet class="h-3.5 w-3.5 text-emerald-500" />
                {{
                  walletStore.loading && !walletStore.wallet
                    ? '…'
                    : formatMoney(walletStore.wallet?.balance ?? 0)
                }}
              </button>
            </div>
            <div class="mt-2 grid grid-cols-2 gap-2">
              <button
                v-for="item in profileItems"
                :key="item.to"
                class="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-[13px] font-medium text-foreground/75 transition-colors hover:bg-border hover:text-foreground"
                @click="go(item.to)"
              >
                <component :is="item.icon" class="h-4 w-4 text-muted-foreground" />
                {{ item.label }}
              </button>
            </div>
            <div class="mt-2 flex gap-3">
              <BaseButton variant="outline" block @click="onSignOut">Sign Out</BaseButton>
              <BaseButton variant="primary" block @click="go('/dashboard')">Dashboard</BaseButton>
            </div>
          </template>
          <template v-else-if="authStore.isLoaded">
            <div class="mt-3 flex gap-3">
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
</style>
