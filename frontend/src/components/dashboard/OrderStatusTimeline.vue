<script setup lang="ts">
import { computed } from 'vue'
import {
  Check,
  CheckCircle2,
  CircleDashed,
  CreditCard,
  Loader2,
  PartyPopper,
  TrendingUp,
  XCircle,
} from '@lucide/vue'
import type { Order, OrderStatus } from '@/types/models'
import { formatNumber } from '@/utils/format'

/**
 * Visual status ladder for an order:
 *
 *   Pending Payment → Paid → Processing → In progress → Partial → Completed
 *
 * Plus a live progress bar derived from the provider's remaining/delivered
 * counts (synced by the backend order-sync job), so the user sees real
 * delivery progress — not just a status word.
 */

const props = withDefaults(
  defineProps<{
    order: Order
    /** 'sm' (order list) or 'lg' (order detail page). */
    size?: 'sm' | 'lg'
  }>(),
  { size: 'sm' },
)

interface Step {
  key: string
  status: OrderStatus
  label: string
  icon: typeof CreditCard
}

/** Large-mode sizing (order detail page) vs compact (order list). */
const CIRCLE = props.size === 'lg' ? 'h-11 w-11' : 'h-8 w-8'
const GLYPH = props.size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'
const LABEL = props.size === 'lg' ? 'text-xs sm:text-sm' : 'text-[10px] sm:text-[11px]'
const CONNECTOR = props.size === 'lg' ? 'mt-[1.35rem]' : 'mt-3.5'
const BAR = props.size === 'lg' ? 'h-2.5' : 'h-2'

const HAPPY_PATH: Step[] = [
  { key: 'pending', status: 'Pending Payment', label: 'Pending payment', icon: CreditCard },
  { key: 'paid', status: 'Paid', label: 'Paid', icon: Check },
  { key: 'processing', status: 'Processing', label: 'Processing', icon: Loader2 },
  { key: 'inprogress', status: 'In progress', label: 'In progress', icon: TrendingUp },
  { key: 'partial', status: 'Partial', label: 'Partial', icon: CircleDashed },
  { key: 'completed', status: 'Completed', label: 'Completed', icon: PartyPopper },
]

const TERMINAL_FAIL = new Set<OrderStatus>(['Cancelled', 'Refunded', 'Failed'])

const currentIndex = computed(() => {
  const idx = HAPPY_PATH.findIndex((s) => s.status === props.order.status)
  return idx === -1 ? 0 : idx
})

/** Order reached a failure terminal state. */
const failed = computed(() => TERMINAL_FAIL.has(props.order.status))
/** Order is completed. */
const done = computed(() => props.order.status === 'Completed')

/**
 * Provider-reported delivery states. The bar only shows once the provider
 * actually reports delivery counts — a fresh order has `remains` defaulted
 * to 0 in the DB, which must not be read as "100% delivered".
 */
const DELIVERY_STATES = ['In progress', 'Partial', 'Completed']
const showsProgress = computed(
  () => !failed.value && DELIVERY_STATES.includes(props.order.status),
)

/** Live delivery progress (0-100) from the provider's `remains` count. */
const deliveryPct = computed(() => {
  if (done.value) return 100
  const { quantity, remains } = props.order
  if (quantity > 0 && remains >= 0 && remains <= quantity) {
    return Math.max(0, Math.round(((quantity - remains) / quantity) * 100))
  }
  return 0
})

const delivered = computed(() => {
  const { quantity, remains } = props.order
  if (quantity > 0 && remains >= 0 && remains <= quantity) {
    return Math.max(0, quantity - remains)
  }
  return null
})
</script>

<template>
  <div>
    <!-- Live progress bar (only when the provider reports delivery counts) -->
    <div v-if="showsProgress" class="mb-4">
      <div
        class="flex items-center justify-between"
        :class="size === 'lg' ? 'text-sm' : 'text-[11px]'"
      >
        <span class="font-medium text-white/60">
          {{ delivered !== null ? `${formatNumber(delivered)} / ${formatNumber(order.quantity)} delivered` : 'Delivery in progress…' }}
        </span>
        <span class="font-semibold text-emerald-300">{{ deliveryPct }}%</span>
      </div>
      <div :class="['mt-1.5 overflow-hidden rounded-full bg-white/10', BAR]">
        <div
          class="h-full rounded-full bg-gradient-to-r from-brand-500 via-secondary-500 to-emerald-400 transition-all duration-1000 ease-out"
          :style="{ width: `${deliveryPct}%` }"
        />
      </div>
    </div>

    <!-- Status ladder -->
    <ol class="flex items-start overflow-x-auto pb-1">
      <template v-for="(step, i) in HAPPY_PATH" :key="step.key">
        <!-- connector -->
        <li
          v-if="i > 0"
          :class="[
            'mx-1 hidden h-0.5 flex-1 rounded-full sm:block',
            CONNECTOR,
            i <= currentIndex && !failed ? 'bg-gradient-to-r from-brand-500 to-emerald-400' : 'bg-white/10',
          ]"
        />
        <li class="flex shrink-0 items-center gap-2 sm:flex-col sm:items-center sm:gap-1.5">
          <span
            :class="[
              'flex shrink-0 items-center justify-center rounded-full ring-2 transition-all duration-300',
              CIRCLE,
              failed && i === currentIndex
                ? 'bg-rose-500/15 text-rose-300 ring-rose-400/40'
                : i < currentIndex || done
                  ? 'bg-emerald-400/15 text-emerald-300 ring-emerald-400/40'
                  : i === currentIndex
                    ? 'bg-brand-500/20 text-brand-300 ring-brand-400/60 shadow-glow'
                    : 'bg-white/5 text-white/30 ring-white/10',
            ]"
          >
            <Loader2
              v-if="i === currentIndex && !done && !failed"
              :class="['animate-spin', GLYPH]"
            />
            <component :is="step.icon" v-else :class="GLYPH" />
          </span>
          <span
            :class="[
              'font-medium leading-tight',
              LABEL,
              failed && i === currentIndex
                ? 'text-rose-300'
                : i <= currentIndex || done
                  ? 'text-white/80'
                  : 'text-white/30',
            ]"
          >
            {{ step.label }}
          </span>
        </li>
      </template>
    </ol>

    <!-- Terminal failure -->
    <div
      v-if="failed"
      class="mt-3 flex items-center gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-200"
    >
      <XCircle class="h-4 w-4 shrink-0" />
      {{ order.status }}
      <template v-if="order.error">— {{ order.error }}</template>
    </div>
    <div
      v-else-if="done"
      class="mt-3 flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-200"
    >
      <CheckCircle2 class="h-4 w-4 shrink-0" />
      Order completed — enjoy your growth! 🎉
    </div>
  </div>
</template>
