<script setup lang="ts">
import { Megaphone } from '@lucide/vue'
import { useAnnouncementsStore } from '@/stores/announcements.store'
import { ANNOUNCEMENT_STYLES } from '@/utils/constants'
import BaseEmptyState from '@/components/ui/BaseEmptyState.vue'
import BaseSkeleton from '@/components/ui/BaseSkeleton.vue'

const announcements = useAnnouncementsStore()
</script>

<template>
  <div class="glass rounded-2xl p-6 shadow-card">
    <div class="flex items-center gap-2">
      <Megaphone class="h-4 w-4 text-brand-300" />
      <h3 class="font-display text-base font-semibold text-ink">Announcements</h3>
    </div>

    <div v-if="announcements.loading" class="mt-4 space-y-3">
      <BaseSkeleton v-for="n in 2" :key="n" class="h-16 w-full" />
    </div>

    <div v-else-if="announcements.items.length" class="mt-4 space-y-3">
      <div
        v-for="announcement in announcements.items"
        :key="announcement._id"
        class="rounded-xl border p-4"
        :class="ANNOUNCEMENT_STYLES[announcement.type] ?? ANNOUNCEMENT_STYLES.info"
      >
        <p class="text-sm font-semibold">{{ announcement.title }}</p>
        <p v-if="announcement.body" class="mt-1 text-xs leading-relaxed opacity-80">
          {{ announcement.body }}
        </p>
      </div>
    </div>

    <BaseEmptyState
      v-else
      title="No announcements"
      message="You're all caught up — nothing new right now."
    />
  </div>
</template>
