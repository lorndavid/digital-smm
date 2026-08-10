<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronDown, LogOut, Package, Settings, User, Wallet } from '@lucide/vue'
import { useAuthStore } from '@/stores/auth.store'
import AvatarCircle from './AvatarCircle.vue'

/**
 * Shared account dropdown — used by the landing navbar and the dashboard
 * topbar. The backdrop sits at z-45 (between the sticky header's z-30 and
 * the panel's z-50) so it reliably covers sidebars at z-40.
 */
const emit = defineEmits<{ navigated: [] }>()

const router = useRouter()
const authStore = useAuthStore()

const profileOpen = ref(false)

/** Account dropdown shortcuts (modern SaaS pattern). */
const profileItems = [
  { label: 'Profile', to: '/dashboard/profile', icon: User },
  { label: 'Wallet', to: '/dashboard/wallet', icon: Wallet },
  { label: 'Orders', to: '/dashboard/orders', icon: Package },
  { label: 'Settings', to: '/dashboard/settings', icon: Settings },
]

function go(to: string): void {
  profileOpen.value = false
  emit('navigated')
  void router.push(to)
}

// Close the dropdown on Escape (backdrop click handles the mouse).
function onEscape(e: KeyboardEvent): void {
  if (e.key === 'Escape') profileOpen.value = false
}
watch(profileOpen, (open) => {
  if (open) document.addEventListener('keydown', onEscape)
  else document.removeEventListener('keydown', onEscape)
})

async function signOut(): Promise<void> {
  profileOpen.value = false
  emit('navigated')
  await authStore.signOut()
  void router.push('/')
}
</script>

<template>
  <div class="relative">
    <button
      class="flex h-9 items-center gap-1.5 rounded-full border border-line bg-soft py-1 pl-1 pr-2 transition-colors hover:border-brand-400/50"
      aria-label="Account menu"
      :aria-expanded="profileOpen"
      :title="authStore.user?.email ?? 'My profile'"
      @click="profileOpen = !profileOpen"
    >
      <AvatarCircle
        :name="authStore.user?.name ?? ''"
        :email="authStore.user?.email ?? ''"
        :avatar-url="authStore.user?.avatarUrl ?? ''"
        :size="28"
      />
      <span class="hidden max-w-[110px] truncate text-sm font-semibold text-ink/90 sm:block">
        {{ authStore.user?.name || 'VidSMM User' }}
      </span>
      <ChevronDown
        class="h-3.5 w-3.5 text-ink/40 transition-transform duration-200"
        :class="profileOpen ? 'rotate-180' : ''"
      />
    </button>

    <!-- Transparent backdrop: clicking anywhere outside closes the menu -->
    <div v-if="profileOpen" class="fixed inset-0 z-45 cursor-default" @click="profileOpen = false" />

    <Transition name="profile">
      <div
        v-if="profileOpen"
        class="glass-strong absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-2xl p-1.5 shadow-glow"
      >
        <div class="flex items-center gap-3 px-3 py-2.5">
          <AvatarCircle
            :name="authStore.user?.name ?? ''"
            :email="authStore.user?.email ?? ''"
            :avatar-url="authStore.user?.avatarUrl ?? ''"
            :size="40"
          />
          <div class="min-w-0">
            <p class="truncate text-sm font-semibold text-ink">
              {{ authStore.user?.name || 'VidSMM User' }}
            </p>
            <p class="truncate text-xs text-ink/40">{{ authStore.user?.email ?? '' }}</p>
          </div>
        </div>
        <div class="my-1 border-t border-line" />
        <button
          v-for="item in profileItems"
          :key="item.to"
          class="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-ink/70 transition-colors hover:bg-ink/5 hover:text-ink"
          @click="go(item.to)"
        >
          <component :is="item.icon" class="h-4 w-4 text-ink/40" />
          {{ item.label }}
        </button>
        <div class="my-1 border-t border-line" />
        <button
          class="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-rose-300 transition-colors hover:bg-rose-500/10 hover:text-rose-200"
          @click="signOut"
        >
          <LogOut class="h-4 w-4" /> Sign Out
        </button>
      </div>
    </Transition>
  </div>
</template>

<style>
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
