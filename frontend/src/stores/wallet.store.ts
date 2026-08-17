import { defineStore } from 'pinia'
import { ref } from 'vue'
import { paymentApi } from '@/api/payment.api'
import { profileApi } from '@/api/profile.api'
import { ApiRequestError } from '@/api/client'
import { event } from '@/analytics'
import type { Payment, Wallet } from '@/types/models'

export const useWalletStore = defineStore('wallet', () => {
  const wallet = ref<Wallet | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const message = (err: unknown, fallback: string) =>
    err instanceof ApiRequestError ? err.message : fallback

  /** Balance freshness window — a recently fetched wallet is reused instead
   *  of re-hitting /profile on every view mount. */
  const FRESH_MS = 15_000
  let lastFetchedAt = 0

  async function fetchWallet(): Promise<void> {
    // The topbar + every dashboard view call this on mount; dedupe so a
    // single page load issues ONE /profile request instead of several.
    // refreshWallet() below stays unconditional (used after orders/top-ups).
    if (wallet.value && Date.now() - lastFetchedAt < FRESH_MS) return
    loading.value = true
    error.value = null
    try {
      const profile = await profileApi.get()
      wallet.value = profile.wallet
      lastFetchedAt = Date.now()
    } catch (err) {
      error.value = message(err, 'Failed to load wallet')
    } finally {
      loading.value = false
    }
  }

  /** Generates a KHQR payment for a top-up. Returns the created payment. */
  async function topUp(amount: number): Promise<Payment> {
    // UI intent (frontend truth) — financial truth comes from backend state.
    event('wallet_topup_start', {
      order_type: 'topup',
      currency: 'USD',
      value: amount,
    })
    const { payment } = await paymentApi.create({ purpose: 'topup', amount })
    event('payment_create', {
      order_type: 'topup',
      currency: 'USD',
      value: amount,
      provider: payment.provider,
    })
    return payment
  }

  /** Confirms the top-up settled and refreshes the wallet (always fresh). */
  async function refreshWallet(): Promise<Wallet> {
    const profile = await profileApi.get()
    wallet.value = profile.wallet
    lastFetchedAt = Date.now()
    return profile.wallet
  }

  return { wallet, loading, error, fetchWallet, topUp, refreshWallet }
})
