import { defineStore } from 'pinia'
import { ref } from 'vue'
import { servicesApi } from '@/api/services.api'
import type { Announcement } from '@/types/models'

export const useAnnouncementsStore = defineStore('announcements', () => {
  const items = ref<Announcement[]>([])
  const loading = ref(false)

  async function fetchAnnouncements(): Promise<void> {
    loading.value = true
    try {
      items.value = await servicesApi.announcements()
    } catch {
      items.value = []
    } finally {
      loading.value = false
    }
  }

  return { items, loading, fetchAnnouncements }
})
