<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useLocalStorage } from '@vueuse/core'
import { LogOut } from '@lucide/vue'
import { useAuthStore } from '@/stores/auth.store'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'

const router = useRouter()
const authStore = useAuthStore()

// Preferences persisted locally (these are client-side preferences).
const emailNotifications = useLocalStorage('vidsmm:email-notifications', true)
const orderUpdates = useLocalStorage('vidsmm:order-updates', true)
const promoEmails = useLocalStorage('vidsmm:promo-emails', false)
const language = useLocalStorage('vidsmm:language', 'en')

interface ToggleRow {
  label: string
  description: string
  model: ReturnType<typeof useLocalStorage<boolean>>
}

const toggles: ToggleRow[] = [
  {
    label: 'Email notifications',
    description: 'Order receipts and payment confirmations.',
    model: emailNotifications,
  },
  {
    label: 'Order updates',
    description: 'Progress updates for your in-flight orders.',
    model: orderUpdates,
  },
  {
    label: 'Promotional emails',
    description: 'Occasional offers and service announcements.',
    model: promoEmails,
  },
]

async function signOut(): Promise<void> {
  await authStore.signOut()
  router.push('/')
}
</script>

<template>
  <div class="mx-auto max-w-2xl space-y-6">
    <div>
      <h1 class="font-display text-2xl font-bold text-white">Settings</h1>
      <p class="mt-1 text-sm text-white/50">Personalize your VidSMM experience.</p>
    </div>

    <!-- Notifications -->
    <div class="glass rounded-3xl p-6 shadow-card sm:p-8">
      <h2 class="font-display text-base font-semibold text-white">Notifications</h2>
      <div class="mt-5 space-y-4">
        <div
          v-for="toggle in toggles"
          :key="toggle.label"
          class="flex items-center justify-between gap-4"
        >
          <div>
            <p class="text-sm font-medium text-white">{{ toggle.label }}</p>
            <p class="mt-0.5 text-xs text-white/45">{{ toggle.description }}</p>
          </div>
          <button
            role="switch"
            :aria-checked="toggle.model.value"
            class="relative h-6 w-11 shrink-0 rounded-full transition-colors"
            :class="toggle.model.value ? 'bg-gradient-to-r from-brand-500 to-secondary-500' : 'bg-white/10'"
            @click="toggle.model.value = !toggle.model.value"
          >
            <span
              class="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all"
              :class="toggle.model.value ? 'left-[22px]' : 'left-0.5'"
            />
          </button>
        </div>
      </div>
    </div>

    <!-- Preferences -->
    <div class="glass rounded-3xl p-6 shadow-card sm:p-8">
      <h2 class="font-display text-base font-semibold text-white">Preferences</h2>
      <div class="mt-5 space-y-4">
        <BaseSelect
          v-model="language"
          label="Language"
          :options="[
            { value: 'en', label: 'English' },
            { value: 'km', label: 'ខ្មែរ (Khmer)' },
          ]"
        />
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-white">Theme</p>
            <p class="mt-0.5 text-xs text-white/45">VidSMM is designed dark by default.</p>
          </div>
          <span class="rounded-full bg-white/5 px-3 py-1 text-xs text-white/50">Dark 🌙</span>
        </div>
      </div>
    </div>

    <!-- Danger zone -->
    <div class="glass rounded-3xl border-rose-400/20 p-6 shadow-card sm:p-8">
      <h2 class="font-display text-base font-semibold text-rose-200">Danger zone</h2>
      <p class="mt-1 text-xs text-white/45">
        Signing out ends your current session on this device.
      </p>
      <BaseButton class="mt-4" variant="danger" @click="signOut">
        <LogOut class="h-4 w-4" /> Sign out
      </BaseButton>
    </div>
  </div>
</template>
