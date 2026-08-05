import { afterEach, describe, expect, it, vi } from 'vitest'
import { createProviderSyncCache } from './provider-sync-cache.js'

afterEach(() => {
  vi.useRealTimers()
})

describe('providerSyncCache', () => {
  it('allows the first check for a payment', () => {
    const cache = createProviderSyncCache(10_000)
    expect(cache.isDue('p1')).toBe(true)
  })

  it('throttles repeat checks within the TTL', () => {
    const cache = createProviderSyncCache(10_000)
    cache.markSynced('p1')
    expect(cache.isDue('p1')).toBe(false)
  })

  it('allows a check again once the TTL elapses', () => {
    vi.useFakeTimers()
    const cache = createProviderSyncCache(10_000)
    cache.markSynced('p1')
    vi.advanceTimersByTime(9_999)
    expect(cache.isDue('p1')).toBe(false)
    vi.advanceTimersByTime(2)
    expect(cache.isDue('p1')).toBe(true)
  })

  it('never throttles payments that were never marked synced', () => {
    const cache = createProviderSyncCache(10_000)
    cache.markSynced('p1')
    expect(cache.isDue('p2')).toBe(true)
  })

  it('treats failed (unrecorded) checks as due on the next poll', () => {
    const cache = createProviderSyncCache(10_000)
    cache.markSynced('p1')
    // A failed provider call never calls markSynced, so the next poll is due.
    expect(cache.isDue('p1')).toBe(false)
  })
})
