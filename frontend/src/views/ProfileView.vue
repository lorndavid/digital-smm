<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useUser } from '@clerk/vue'
import { Camera, Save } from '@lucide/vue'
import { profileApi } from '@/api/profile.api'
import { useToast } from '@/composables/useToast'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSkeleton from '@/components/ui/BaseSkeleton.vue'

const { user } = useUser()
const toast = useToast()

const loading = ref(true)
const saving = ref(false)
const name = ref('')
const avatarUrl = ref('')
const email = ref('')

onMounted(async () => {
  try {
    const profile = await profileApi.get()
    name.value = profile.user.name || (user?.value?.fullName ?? '')
    avatarUrl.value = profile.user.avatarUrl || (user?.value?.imageUrl ?? '')
    email.value = profile.user.email
  } catch {
    email.value = user?.value?.primaryEmailAddress?.emailAddress ?? ''
    name.value = user?.value?.fullName ?? ''
  } finally {
    loading.value = false
  }
})

async function save(): Promise<void> {
  saving.value = true
  try {
    await profileApi.update({
      name: name.value.trim() || undefined,
      avatarUrl: avatarUrl.value.trim() || undefined,
    })
    toast.success('Profile updated')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Failed to update profile')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-2xl space-y-6">
    <div>
      <h1 class="font-display text-2xl font-bold text-white">Profile</h1>
      <p class="mt-1 text-sm text-white/50">Manage how you appear on VidSMM.</p>
    </div>

    <div v-if="loading" class="space-y-3">
      <BaseSkeleton class="h-28 w-full" />
      <BaseSkeleton class="h-24 w-full" />
    </div>

    <div v-else class="glass space-y-6 rounded-3xl p-6 shadow-card sm:p-8">
      <div class="flex items-center gap-5">
        <div class="relative">
          <img
            v-if="avatarUrl"
            :src="avatarUrl"
            alt="Avatar"
            class="h-20 w-20 rounded-2xl border border-white/10 object-cover shadow-glow"
          />
          <div
            v-else
            class="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-secondary-500 font-display text-2xl font-bold text-white"
          >
            {{ (name || 'V').slice(0, 2).toUpperCase() }}
          </div>
          <div
            class="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 text-white shadow-glow"
          >
            <Camera class="h-4 w-4" />
          </div>
        </div>
        <div>
          <p class="font-display text-lg font-semibold text-white">{{ name || 'VidSMM User' }}</p>
          <p class="text-sm text-white/45">{{ email }}</p>
          <p class="mt-1 text-xs text-white/35">Email is managed by your Google account.</p>
        </div>
      </div>

      <div class="space-y-4">
        <BaseInput v-model="name" label="Display name" placeholder="Your name" maxlength="120" />
        <BaseInput
          v-model="avatarUrl"
          label="Avatar URL"
          placeholder="https://example.com/avatar.jpg"
          hint="Leave empty to keep your Google profile picture."
        />
      </div>

      <div class="flex justify-end">
        <BaseButton :loading="saving" @click="save">
          <Save class="h-4 w-4" /> Save changes
        </BaseButton>
      </div>
    </div>
  </div>
</template>
