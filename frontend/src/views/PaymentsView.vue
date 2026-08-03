<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { QrCode, Receipt, Wallet } from '@lucide/vue'
import { paymentApi } from '@/api/payment.api'
import { formatDate, formatMoney, formatNumber } from '@/utils/format'
import { PAYMENT_PURPOSE_LABEL, PAYMENT_STATUS_META } from '@/utils/constants'
import type { Order, Payment } from '@/types/models'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import BaseSkeleton from '@/components/ui/BaseSkeleton.vue'
import BaseEmptyState from '@/components/ui/BaseEmptyState.vue'

const items = ref<Payment[]>([])
const total = ref(0)
const loading = ref(true)
const receipt = ref<Payment | null>(null)

async function load(): Promise<void> {
  loading.value = true
  try {
    const result = await paymentApi.history({ limit: 50 })
    items.value = result.items
    total.value = result.total
  } catch {
    /* toast handled by store-level error surface */
  } finally {
    loading.value = false
  }
}

function serviceName(payment: Payment): string {
  const order = payment.order
  if (order && typeof order === 'object' && typeof order.service === 'object') {
    return order.service.name
  }
  return ''
}

function orderNumber(payment: Payment): number | null {
  const order = payment.order
  return order && typeof order === 'object' ? order.orderNumber : null
}

onMounted(() => void load())
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-6">
    <div>
      <h1 class="font-display text-2xl font-bold text-white">Payments</h1>
      <p class="mt-1 text-sm text-white/50">Every KHQR transaction, in order. ({{ total }})</p>
    </div>

    <div v-if="loading" class="space-y-4">
      <BaseSkeleton v-for="n in 6" :key="n" class="h-20 w-full" />
    </div>

    <BaseEmptyState
      v-else-if="items.length === 0"
      title="No payments yet"
      message="Your KHQR payments will show up here once you top up or buy."
    />

    <!-- Timeline -->
    <div v-else class="relative ml-2 space-y-0">
      <div class="absolute bottom-4 left-[18px] top-4 w-px bg-gradient-to-b from-brand-400/50 via-white/10 to-transparent" />

      <div
        v-for="payment in items"
        :key="payment._id"
        class="relative flex gap-4 pb-6 pl-1"
      >
        <!-- Node -->
        <div class="z-10 mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-night-soft shadow-card">
          <Wallet
            v-if="payment.purpose === 'topup'"
            class="h-4 w-4 text-secondary-300"
          />
          <QrCode v-else class="h-4 w-4 text-brand-300" />
        </div>

        <!-- Card -->
        <div class="glass min-w-0 flex-1 rounded-2xl p-5 shadow-card transition-all duration-300 hover:border-brand-400/30">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <p class="text-sm font-semibold text-white">
                  {{ payment.purpose === 'topup' ? PAYMENT_PURPOSE_LABEL.topup : serviceName(payment) || 'Service order' }}
                </p>
                <BaseBadge :tone="PAYMENT_STATUS_META[payment.status]?.tone ?? 'neutral'" dot>
                  {{ PAYMENT_STATUS_META[payment.status]?.label ?? payment.status }}
                </BaseBadge>
              </div>
              <p class="mt-1 font-mono text-xs text-white/40">{{ payment.referenceId }}</p>
              <p class="mt-0.5 text-xs text-white/40">
                {{ formatDate(payment.approvedAt ?? payment.createdAt) }}
                <template v-if="orderNumber(payment)"> · Order #{{ orderNumber(payment) }}</template>
              </p>
            </div>

            <div class="flex shrink-0 items-center gap-4">
              <p class="text-sm font-bold text-white">{{ formatMoney(payment.amount) }}</p>
              <button
                class="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/60 transition-all hover:border-brand-400/50 hover:text-white"
                title="View receipt"
                @click="receipt = payment"
              >
                <Receipt class="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Receipt modal -->
    <BaseModal :open="!!receipt" title="Payment receipt" max-width="max-w-md" @close="receipt = null">
      <div v-if="receipt" class="space-y-4">
        <div class="flex items-center justify-between rounded-2xl bg-gradient-to-r from-brand-600/30 to-secondary-600/20 p-4">
          <div>
            <p class="text-xs text-white/50">Amount paid</p>
            <p class="font-display text-3xl font-bold text-white">{{ formatMoney(receipt.amount) }}</p>
          </div>
          <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10">
            <QrCode class="h-7 w-7 text-white/80" />
          </div>
        </div>

        <dl class="space-y-2.5 text-sm">
          <div class="flex items-center justify-between">
            <dt class="text-white/45">Reference</dt>
            <dd class="font-mono text-xs text-white/80">{{ receipt.referenceId }}</dd>
          </div>
          <div class="flex items-center justify-between">
            <dt class="text-white/45">Provider</dt>
            <dd class="capitalize text-white/80">{{ receipt.provider }} · {{ receipt.method }}</dd>
          </div>
          <div class="flex items-center justify-between">
            <dt class="text-white/45">Purpose</dt>
            <dd class="text-white/80">{{ PAYMENT_PURPOSE_LABEL[receipt.purpose] ?? receipt.purpose }}</dd>
          </div>
          <template v-if="receipt.purpose === 'order' && typeof receipt.order === 'object'">
            <div class="flex items-center justify-between">
              <dt class="text-white/45">Service</dt>
              <dd class="text-white/80">{{ serviceName(receipt) }}</dd>
            </div>
            <div class="flex items-center justify-between">
              <dt class="text-white/45">Quantity</dt>
              <dd class="text-white/80">{{ formatNumber((receipt.order as Order).quantity) }}</dd>
            </div>
          </template>
          <div class="flex items-center justify-between">
            <dt class="text-white/45">Paid at</dt>
            <dd class="text-white/80">{{ formatDate(receipt.approvedAt ?? receipt.createdAt) }}</dd>
          </div>
        </dl>

        <div class="flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-4 py-3 text-xs text-emerald-200/80">
          <Receipt class="h-4 w-4 shrink-0" />
          This receipt confirms your payment was settled securely via Bakong KHQR.
        </div>
      </div>
    </BaseModal>
  </div>
</template>
