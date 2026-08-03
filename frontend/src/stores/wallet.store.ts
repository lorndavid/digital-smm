import { defineStore } from 'pinia'
import { ref } from 'vue'
import { paymentApi } from '@/api/payment.api'
import { profileApi } from '@/api/profile.api'
import { ApiRequestError } from '@/api/client'
import type { Payment, Wallet } from '@/types/models'

export const useWalletStore = defineStore('wallet', () => {
  const wallet = ref<Wallet | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const message = (err: unknown, fallback: string) =>
    err instanceof ApiRequestError ? err.message : fallback

  async function fetchWallet(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const profile = await profileApi.get()
      wallet.value = profile.wallet
    } catch (err) {
      error.value = message(err, 'Failed to load wallet')
    } finally {
      loading.value = false
    }
  }

  /** Generates a KHQR payment for a top-up. Returns the created payment. */
  async function topUp(amount: number): Promise<Payment> {
    const { payment } = await paymentApi.create({ purpose: 'topup', amount })
    return payment
  }

  /** Confirms the top-up settled and refreshes the wallet. */
  async function refreshWallet(): Promise<Wallet> {
    const profile = await profileApi.get()
    wallet.value = profile.wallet
    return profile.wallet
  }

  return { wallet, loading, error, fetchWallet, topUp, refreshWallet }
})
