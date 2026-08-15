<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ArrowDownLeft, ArrowUpRight, Plus, Wallet } from '@lucide/vue'
import { useWalletStore } from '@/stores/wallet.store'
import { paymentApi } from '@/api/payment.api'
import { ApiRequestError } from '@/api/client'
import { useToast } from '@/composables/useToast'
import BaseModal from '@/components/ui/BaseModal.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSkeleton from '@/components/ui/BaseSkeleton.vue'
import BaseEmptyState from '@/components/ui/BaseEmptyState.vue'
import KhqrPaymentModal from '@/components/payment/KhqrPaymentModal.vue'
import { formatMoney, formatDate } from '@/utils/format'
import type { Payment, WalletTransaction } from '@/types/models'

const store = useWalletStore()
const toast = useToast()

const topUpOpen = ref(false)
const amount = ref<number | null>(null)
const error = ref('')
const submitting = ref(false)

/** Active KHQR payment shown in the centered payment modal. */
const activePayment = ref<Payment | null>(null)
const khqrOpen = ref(false)

const transactions = computed<WalletTransaction[]>(() => store.wallet?.transactions ?? [])

function openTopUp(): void {
  amount.value = null
  error.value = ''
  topUpOpen.value = true
}

function validateAmount(): boolean {
  if (!amount.value || amount.value < 0.01) {
    error.value = 'Minimum top-up is $0.01 USD'
    return false
  }
  return true
}

/** Creates the top-up payment and opens the KHQR in a centered modal — no
 *  page navigation, so the customer stays on their wallet while they pay. */
async function continueToPayment(): Promise<void> {
  if (!validateAmount()) return
  // Guard against double-taps racing two payments (the KHQR modal would
  // re-open over itself mid-flight).
  if (submitting.value) return
  submitting.value = true
  error.value = ''
  try {
    const payment = await store.topUp(amount.value as number)
    topUpOpen.value = false
    activePayment.value = payment
    khqrOpen.value = true
    toast.success('Payment ready — scan the KHQR to top up')
  } catch (err) {
    error.value = err instanceof ApiRequestError ? err.message : 'Failed to create payment'
  } finally {
    submitting.value = false
  }
}

/** Payment settled — refresh the balance so the new credit shows instantly. */
async function onPaid(payment: Payment): Promise<void> {
  try {
    await store.refreshWallet()
    toast.success(`${formatMoney(payment.amount)} added to your wallet`)
  } catch {
    /* balance refreshes on next view mount if this fails */
  }
}

/** Modal closed (after success auto-close, cancel, or manual close). */
function onKhqrClose(): void {
  khqrOpen.value = false
  activePayment.value = null
  // Refresh in case the customer paid on another tab / closed mid-scan.
  void store.refreshWallet().catch(() => undefined)
}

const quickAmounts = [10, 25, 50, 100]

onMounted(() => {
  void store.fetchWallet().catch(() => undefined)
  void paymentApi.history({ limit: 20 }).catch(() => undefined)
})
</script>

<template>
  <div class="w-full space-y-5">
    <div>
      <h1 class="font-display text-xl font-bold text-ink">Wallet</h1>
      <p class="mt-0.5 text-sm text-ink/50">Top up with KHQR and track every transaction.</p>
    </div>

    <!-- Balance hero card -->
    <div
      class="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 sm:p-7 shadow-xl border border-indigo-500/20 text-white"
    >
      <!-- Background subtle glow accents -->
      <div class="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-brand-500/20 blur-3xl" />
      <div class="pointer-events-none absolute -left-10 -bottom-10 h-40 w-40 rounded-full bg-indigo-500/20 blur-3xl" />
      <div class="bg-grid pointer-events-none absolute inset-0 opacity-10" />

      <div class="relative flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-center">
        <div class="space-y-1">
          <div class="flex items-center gap-2 text-indigo-200/80 text-xs font-medium uppercase tracking-wider">
            <Wallet class="h-4 w-4 text-emerald-400" />
            <span>Available balance</span>
          </div>
          <p class="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            {{ formatMoney(store.wallet?.balance ?? 0) }}
          </p>
          <div class="pt-1 flex flex-wrap items-center gap-4 text-xs text-indigo-200/70 font-mono">
            <span>Top-ups: <strong class="text-white font-semibold">{{ formatMoney(store.wallet?.totalTopUp ?? 0) }}</strong></span>
            <span class="text-indigo-400/40">•</span>
            <span>Spent: <strong class="text-white font-semibold">{{ formatMoney(store.wallet?.totalSpent ?? 0) }}</strong></span>
          </div>
        </div>

        <button
          type="button"
          class="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-indigo-500 px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition-all hover:brightness-110 active:scale-95 shrink-0"
          @click="openTopUp"
        >
          <Plus class="h-4 w-4" /> Top up
        </button>
      </div>
    </div>

    <!-- Transactions -->
    <div class="glass rounded-xl shadow-card">
      <div class="border-b border-ink/10 px-5 py-3">
        <h2 class="font-display text-sm font-semibold text-ink">Transaction history</h2>
      </div>

      <div v-if="store.loading" class="space-y-3 p-6">
        <BaseSkeleton v-for="n in 4" :key="n" class="h-12 w-full" />
      </div>

      <BaseEmptyState
        v-else-if="transactions.length === 0"
        title="No transactions yet"
        message="Top up your wallet to get started."
      />

      <ul v-else class="divide-y divide-ink/[0.06]">
        <li
          v-for="(tx, index) in transactions"
          :key="tx._id ?? index"
          class="flex items-center justify-between gap-4 px-5 py-3"
        >
          <div class="flex items-center gap-3">
            <div
              class="flex h-8 w-8 items-center justify-center rounded-lg"
              :class="tx.type === 'credit' ? 'bg-emerald-400/15 text-emerald-300' : 'bg-rose-400/15 text-rose-300'"
            >
              <ArrowDownLeft v-if="tx.type === 'credit'" class="h-4 w-4" />
              <ArrowUpRight v-else class="h-4 w-4" />
            </div>
            <div>
              <p class="text-sm font-medium text-ink">{{ tx.description || tx.refType }}</p>
              <p class="text-xs text-ink/40">{{ formatDate(tx.createdAt) }}</p>
            </div>
          </div>
          <p
            class="text-sm font-semibold"
            :class="tx.type === 'credit' ? 'text-emerald-300' : 'text-rose-300'"
          >
            {{ tx.type === 'credit' ? '+' : '−' }}{{ formatMoney(tx.amount) }}
          </p>
        </li>
      </ul>
    </div>

    <!-- Top-up modal -->
    <BaseModal :open="topUpOpen" title="Top up wallet" max-width="max-w-lg" @close="topUpOpen = false">
      <div class="space-y-5">
        <div class="grid grid-cols-4 gap-2">
          <button
            v-for="quick in quickAmounts"
            :key="quick"
            class="rounded-xl border py-2.5 text-sm font-semibold transition-all"
            :class="amount === quick ? 'border-brand-400/60 bg-brand-500/15 text-ink' : 'border-ink/10 text-ink/60 hover:border-ink/25'"
            @click="amount = quick"
          >
            ${{ quick }}
          </button>
        </div>
        <BaseInput
          :model-value="amount"
          @update:model-value="amount = $event === '' || $event === null ? null : Number($event)"
          label="Custom amount (USD)"
          type="number"
          min="1"
          placeholder="e.g. 20"
          :error="error"
        />
        <p class="flex items-center gap-2 text-xs text-ink/40">
          <Wallet class="h-4 w-4 text-secondary-400" />
          You'll pay securely with Bakong KHQR — a payment window opens right here.
        </p>
        <BaseButton class="w-full" size="lg" :loading="submitting" @click="continueToPayment">
          Continue to payment <ArrowUpRight class="h-4 w-4" />
        </BaseButton>
      </div>
    </BaseModal>

    <!-- Centered KHQR payment window — live auto-verification, bank app
         deep links, countdown + success state (standard Cambodian UX). -->
    <KhqrPaymentModal
      :open="khqrOpen"
      :payment="activePayment"
      @close="onKhqrClose"
      @paid="onPaid"
    />
  </div>
</template>
