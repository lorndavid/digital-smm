<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
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
import { formatMoney, formatDate } from '@/utils/format'
import type { WalletTransaction } from '@/types/models'

const store = useWalletStore()
const router = useRouter()
const toast = useToast()

const topUpOpen = ref(false)
const amount = ref<number | null>(null)
const error = ref('')
const submitting = ref(false)

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

/** Creates the top-up payment and opens the premium checkout page. */
async function continueToPayment(): Promise<void> {
  if (!validateAmount()) return
  submitting.value = true
  error.value = ''
  try {
    const payment = await store.topUp(amount.value as number)
    topUpOpen.value = false
    toast.success('Payment ready — scan the KHQR to top up')
    await router.push(`/pay/${payment.referenceId}`)
  } catch (err) {
    error.value = err instanceof ApiRequestError ? err.message : 'Failed to create payment'
  } finally {
    submitting.value = false
  }
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

    <!-- Balance hero -->
    <div
      class="animate-gradient relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-700/80 via-brand-600/60 to-secondary-600/40 p-6 shadow-glow"
    >
      <div class="bg-grid pointer-events-none absolute inset-0 opacity-20" />
      <div class="relative flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div class="flex items-center gap-2 text-ink/70">
            <Wallet class="h-4 w-4" />
            <span class="text-[13px]">Available balance</span>
          </div>
          <p class="font-display mt-1 text-3xl font-bold text-ink">
            {{ formatMoney(store.wallet?.balance ?? 0) }}
          </p>
          <div class="mt-2 flex gap-5 text-[13px] text-ink/75">
            <span>Top-ups: <b>{{ formatMoney(store.wallet?.totalTopUp ?? 0) }}</b></span>
            <span>Spent: <b>{{ formatMoney(store.wallet?.totalSpent ?? 0) }}</b></span>
          </div>
        </div>
        <BaseButton size="lg" variant="secondary" @click="openTopUp">
          <Plus class="h-4 w-4" /> Top up
        </BaseButton>
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
          You'll pay securely with Bakong KHQR on the next screen.
        </p>
        <BaseButton class="w-full" size="lg" :loading="submitting" @click="continueToPayment">
          Continue to payment <ArrowUpRight class="h-4 w-4" />
        </BaseButton>
      </div>
    </BaseModal>
  </div>
</template>
