<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useLocalStorage } from '@vueuse/core'
import { LogOut, Moon, Sun } from '@lucide/vue'
import { useAuthStore } from '@/stores/auth.store'
import { useThemeStore } from '@/stores/theme.store'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'

const router = useRouter()
const authStore = useAuthStore()
const themeStore = useThemeStore()

// Preferences persisted locally (these are client-side preferences).
const emailNotifications = useLocalStorage('digitalsmm:email-notifications', true)
const orderUpdates = useLocalStorage('digitalsmm:order-updates', true)
const promoEmails = useLocalStorage('digitalsmm:promo-emails', false)
const language = useLocalStorage('digitalsmm:language', 'en')

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
  <div class="mx-auto w-full max-w-3xl space-y-6">
    <div>
      <h1 class="font-display text-xl font-bold text-ink">Settings</h1>
      <p class="mt-0.5 text-sm text-ink/50">Personalize your DigitalSMM experience.</p>
    </div>

    <!-- Notifications -->
    <div class="glass rounded-2xl p-5 shadow-card sm:p-6">
      <h2 class="font-display text-sm font-semibold text-ink">Notifications</h2>
      <div class="mt-4 space-y-4">
        <div
          v-for="toggle in toggles"
          :key="toggle.label"
          class="flex items-center justify-between gap-4"
        >
          <div>
            <p class="text-sm font-medium text-ink">{{ toggle.label }}</p>
            <p class="mt-0.5 text-xs text-ink/45">{{ toggle.description }}</p>
          </div>
          <button
            role="switch"
            :aria-checked="toggle.model.value"
            class="relative h-6 w-11 shrink-0 rounded-full transition-colors"
            :class="toggle.model.value ? 'bg-gradient-to-r from-brand-500 to-secondary-500' : 'bg-ink/10'"
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
    <div class="glass rounded-2xl p-5 shadow-card sm:p-6">
      <h2 class="font-display text-sm font-semibold text-ink">Preferences</h2>
      <div class="mt-4 space-y-4">
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
            <p class="text-sm font-medium text-ink">Theme</p>
            <p class="mt-0.5 text-xs text-ink/45">
              Light is the default — switch to Dark for low-light sessions.
            </p>
          </div>
          <div class="flex rounded-xl bg-soft p-1">
            <button
              class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all"
              :class="
                themeStore.theme === 'light'
                  ? 'bg-card text-brand-600 shadow-sm dark:text-brand-300'
                  : 'text-ink/50 hover:text-ink'
              "
              @click="themeStore.setTheme('light')"
            >
              <Sun class="h-3.5 w-3.5" /> Light
            </button>
            <button
              class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all"
              :class="
                themeStore.theme === 'dark'
                  ? 'bg-card text-brand-600 shadow-sm dark:text-brand-300'
                  : 'text-ink/50 hover:text-ink'
              "
              @click="themeStore.setTheme('dark')"
            >
              <Moon class="h-3.5 w-3.5" /> Dark
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Danger zone -->
    <div class="glass rounded-2xl border-rose-400/20 p-5 shadow-card sm:p-6">
      <h2 class="font-display text-sm font-semibold text-rose-200">Danger zone</h2>
      <p class="mt-1 text-xs text-ink/45">
        Signing out ends your current session on this device.
      </p>
      <BaseButton class="mt-4" variant="danger" @click="signOut">
        <LogOut class="h-4 w-4" /> Sign out
      </BaseButton>
    </div>
  </div>
</template>
