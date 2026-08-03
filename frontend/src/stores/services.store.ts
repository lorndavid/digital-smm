import { defineStore } from 'pinia'
import { ref } from 'vue'
import { servicesApi } from '@/api/services.api'
import { ApiRequestError } from '@/api/client'
import type { Category, Service } from '@/types/models'

export const useServicesStore = defineStore('services', () => {
  const categories = ref<Category[]>([])
  const services = ref<Service[]>([])
  const featured = ref<Service[]>([])
  const total = ref(0)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const activeCategory = ref<string>('all')

  const message = (err: unknown, fallback: string) =>
    err instanceof ApiRequestError ? err.message : fallback

  async function fetchCategories(): Promise<void> {
    try {
      categories.value = await servicesApi.categories()
    } catch (err) {
      error.value = message(err, 'Failed to load categories')
    }
  }

  async function fetchServices(params: {
    category?: string
    search?: string
    page?: number
    limit?: number
    featured?: boolean
  } = {}): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const result = await servicesApi.list(params)
      services.value = result.items
      total.value = result.total
    } catch (err) {
      error.value = message(err, 'Failed to load services')
    } finally {
      loading.value = false
    }
  }

  async function fetchFeatured(): Promise<void> {
    try {
      featured.value = (await servicesApi.list({ featured: true, limit: 4 })).items
    } catch {
      // Non-critical: the dashboard shows a fallback empty state.
    }
  }

  function selectCategory(id: string): void {
    activeCategory.value = id
  }

  return {
    categories,
    services,
    featured,
    total,
    loading,
    error,
    activeCategory,
    fetchCategories,
    fetchServices,
    fetchFeatured,
    selectCategory,
  }
})
