import { defineStore } from 'pinia'
import { ref } from 'vue'
import { profileApi } from '@/api/profile.api'
import { ApiRequestError } from '@/api/client'

/**
 * Favourited category ids (Explore Services → Favourites tab).
 *
 * Persisted per-user on the backend (`/profile/favorites`) so favourites
 * survive logout/login and sync across devices. Toggling is optimistic —
 * the local list flips instantly and the full list is PUT to the server;
 * on failure the local state rolls back.
 */
export const useFavoritesStore = defineStore('favorites', () => {
  const ids = ref<string[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  /** Freshness window — a recently fetched list is reused across view mounts. */
  const FRESH_MS = 15_000
  let lastFetchedAt = 0

  const message = (err: unknown, fallback: string) =>
    err instanceof ApiRequestError ? err.message : fallback

  function isFavorite(categoryId: string): boolean {
    return ids.value.includes(categoryId)
  }

  async function fetch(): Promise<void> {
    if (ids.value.length > 0 && Date.now() - lastFetchedAt < FRESH_MS) return
    loading.value = true
    error.value = null
    try {
      ids.value = await profileApi.getFavorites()
      lastFetchedAt = Date.now()
    } catch (err) {
      error.value = message(err, 'Failed to load favourites')
    } finally {
      loading.value = false
    }
  }

  /** Optimistically adds/removes a category and syncs the whole list. */
  async function toggle(categoryId: string): Promise<void> {
    const had = ids.value.includes(categoryId)
    const next = had ? ids.value.filter((id) => id !== categoryId) : [...ids.value, categoryId]
    // Optimistic flip first — the UI responds instantly.
    ids.value = next
    lastFetchedAt = Date.now()
    try {
      ids.value = await profileApi.setFavorites(next)
      lastFetchedAt = Date.now()
    } catch (err) {
      // Roll back to the last server-confirmed state.
      ids.value = had ? [...ids.value, categoryId] : ids.value.filter((id) => id !== categoryId)
      error.value = message(err, 'Could not update favourites')
      throw err
    }
  }

  return { ids, loading, error, isFavorite, fetch, toggle }
})
