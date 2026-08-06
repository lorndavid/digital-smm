<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import confetti from 'canvas-confetti'
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  ExternalLink,
  QrCode,
  RefreshCcw,
  RefreshCw,
  Timer,
  TrendingUp,
  XCircle,
  Zap,
} from '@lucide/vue'
import { ordersApi } from '@/api/orders.api'
import { paymentApi, type PaymentStatusResponse } from '@/api/payment.api'
import { usePaymentEvents, type PaymentLiveEvent } from '@/composables/usePaymentEvents'
import { useToast } from '@/composables/useToast'
import { STATUS_META } from '@/utils/constants'
import { SERVICE_TYPE_LABEL } from '@/utils/constants'
import { formatMoney, formatNumber, formatRelative } from '@/utils/format'
import { detectPlatform, type DetectedPlatform } from '@/utils/linkValidation'
import OrderStatusTimeline from '@/components/dashboard/OrderStatusTimeline.vue'
import PlatformIcon from '@/components/ui/PlatformIcon.vue'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseSkeleton from '@/components/ui/BaseSkeleton.vue'
import BaseEmptyState from '@/components/ui/BaseEmptyState.vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import type { Order, Payment, Service } from '@/types/models'

const route = useRoute()
const router = useRouter()
const toast = useToast()

const orderId = computed(() => String(route.params.id ?? ''))

const order = ref<Order | null>(null)
const loading = ref(true)
const error = ref('')
const actionId = ref<string | null>(null)
const refreshing = ref(false)

/** Statuses that never change again — live polling stops once all are terminal. */
const TERMINAL = new Set(['Completed', 'Cancelled', 'Refunded', 'Failed'])

// ---------------------------------------------------------------------------
// Derived order info
// ---------------------------------------------------------------------------

const serviceInfo = computed<Service | null>(() => {
  const s = order.value?.service
  return s && typeof s === 'object' ? s : null
})

const orderPlatform = computed<DetectedPlatform>(() => {
  const s = serviceInfo.value
  if (s) {
    const cat = s.category
    if (cat && typeof cat === 'object' && 'platform' in cat) {
      const p = (cat as { platform: string }).platform
      if (p !== 'other') return p as DetectedPlatform
    }
  }
  return detectPlatform(order.value?.link ?? '')
})

const statusMeta = computed(() => (order.value ? STATUS_META[order.value.status] : null))
const isTerminal = computed(() => !!order.value && TERMINAL.has(order.value.status))
const canPay = computed(() => order.value?.status === 'Pending Payment')
const canCancel = computed(
  () =>
    !!serviceInfo.value?.cancel &&
    !!order.value &&
    ['Processing', 'In progress', 'Partial'].includes(order.value.status),
)
const canRefill = computed(
  () => !!serviceInfo.value?.refill && order.value?.status === 'Completed',
)
const serviceTypeLabel = computed(() =>
  serviceInfo.value ? SERVICE_TYPE_LABEL[serviceInfo.value.type] ?? serviceInfo.value.type : '',
)

// ---------------------------------------------------------------------------
// Delivery analytics (provider `remains` semantics: delivered = qty - remains)
// ---------------------------------------------------------------------------

/**
 * Provider-reported delivery states. `remains` defaults to 0 in the DB, so a
 * fresh order must NOT be read as "fully delivered" — the counts are only
 * meaningful once the provider actually reports a delivery status.
 */
const DELIVERY_STATES = ['In progress', 'Partial', 'Completed']
const showsDelivery = computed(() => !!order.value && DELIVERY_STATES.includes(order.value.status))

const delivered = computed(() => {
  const o = order.value
  if (!o || o.quantity <= 0 || !showsDelivery.value) return null
  if (o.remains >= 0 && o.remains <= o.quantity) return Math.max(0, o.quantity - o.remains)
  return null
})

const deliveryPct = computed(() => {
  if (order.value?.status === 'Completed') return 100
  const d = delivered.value
  if (d === null || !order.value?.quantity) return 0
  return Math.max(0, Math.min(100, Math.round((d / order.value.quantity) * 100)))
})

const analytics = computed(() => {
  const o = order.value
  if (!o) return []
  const items: Array<{ label: string; value: string; accent?: boolean }> = [
    { label: 'Quantity', value: o.quantity > 0 ? formatNumber(o.quantity) : '—' },
    { label: 'Delivered', value: delivered.value !== null ? formatNumber(delivered.value) : '—', accent: true },
    { label: 'Remaining', value: showsDelivery.value && o.remains >= 0 ? formatNumber(o.remains) : '—' },
    { label: 'Rate / 1,000', value: formatMoney(o.pricePerUnit) },
    { label: 'Total', value: formatMoney(o.totalPrice), accent: true },
  ]
  if (o.charge > 0) items.push({ label: 'Provider charge', value: formatMoney(o.charge) })
  if (o.startCount > 0) items.push({ label: 'Start count', value: formatNumber(o.startCount) })
  if (o.providerOrderId) items.push({ label: 'Provider order', value: `#${o.providerOrderId}` })
  items.push({ label: 'Created', value: formatRelative(o.createdAt) })
  items.push({ label: 'Updated', value: formatRelative(o.updatedAt) })
  return items
})

// ---------------------------------------------------------------------------
// Order loading + live refresh (5s while in flight)
// ---------------------------------------------------------------------------

async function load(): Promise<void> {
  if (!orderId.value) {
    error.value = 'Missing order id'
    loading.value = false
    return
  }
  loading.value = true
  error.value = ''
  try {
    order.value = await ordersApi.get(orderId.value)
    // Landing on an unpaid order → surface the QR straight away.
    if (order.value.status === 'Pending Payment' && !payment.value) void startPay()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load order'
  } finally {
    loading.value = false
  }
}

async function refreshSilently(): Promise<void> {
  try {
    order.value = await ordersApi.get(orderId.value)
  } catch {
    /* non-fatal — polling continues */
  }
}

async function refreshManually(): Promise<void> {
  refreshing.value = true
  try {
    await load()
    toast.success('Order refreshed')
  } finally {
    refreshing.value = false
  }
}

// ---------------------------------------------------------------------------
// Actions (cancel / refill)
// ---------------------------------------------------------------------------

async function cancelOrder(): Promise<void> {
  if (!order.value) return
  actionId.value = order.value._id
  try {
    order.value = await ordersApi.cancel(order.value._id)
    toast.success(`Order #${order.value.orderNumber} cancelled`)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Failed to cancel order')
  } finally {
    actionId.value = null
  }
}

async function requestRefill(): Promise<void> {
  if (!order.value) return
  actionId.value = order.value._id
  try {
    const { refill } = await ordersApi.refill(order.value._id)
    toast.success(`Refill #${refill} requested`)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Failed to request refill')
  } finally {
    actionId.value = null
  }
}

function openLink(url: string): void {
  if (url) window.open(url, '_blank', 'noopener')
}

async function copyText(text: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${label} copied`)
  } catch {
    toast.error('Could not copy — select the text manually')
  }
}

// ---------------------------------------------------------------------------
// Inline KHQR re-pay (reuses the backend's orderId payment path — an existing
// pending payment for this order is returned instead of creating a new one)
// ---------------------------------------------------------------------------

const payment = ref<Payment | null>(null)
const paymentLoading = ref(false)
const payError = ref('')
const now = ref(Date.now())

/** Which cancel the confirmation modal is asking about: 'payment' | 'order' | null. */
const pendingCancel = ref<'payment' | 'order' | null>(null)

const payStatus = computed(() => payment.value?.status ?? 'pending')
const isPaid = computed(() => payStatus.value === 'paid')
const isPayTerminal = computed(() => ['paid', 'expired', 'failed', 'refunded'].includes(payStatus.value))

const countdown = computed(() => {
  if (!payment.value?.expiresAt) return { total: 0, mins: '00', secs: '00' }
  const diff = Math.max(0, new Date(payment.value.expiresAt).getTime() - now.value)
  const total = Math.floor(diff / 1000)
  return {
    total,
    mins: String(Math.floor(total / 60)).padStart(2, '0'),
    secs: String(total % 60).padStart(2, '0'),
  }
})
const countdownDanger = computed(() => countdown.value.total > 0 && countdown.value.total <= 60)

let clockTimer: ReturnType<typeof setInterval> | null = null
function startClock(): void {
  stopClock()
  now.value = Date.now()
  clockTimer = setInterval(() => (now.value = Date.now()), 1000)
}
function stopClock(): void {
  if (clockTimer) clearInterval(clockTimer)
  clockTimer = null
}

function celebrate(): void {
  void confetti({ particleCount: 120, spread: 75, origin: { y: 0.7 }, colors: ['#E41A2B', '#00E5FF', '#3B82F6', '#ffffff'] })
}

function applySnapshot(snap: PaymentStatusResponse): void {
  payment.value = snap.payment
  if (snap.order) order.value = snap.order
  if (snap.payment.status === 'paid') onPaid()
}

function applyEvent(event: PaymentLiveEvent): void {
  if (!payment.value) return
  payment.value.status = event.status as Payment['status']
  if (event.approvedAt) payment.value.approvedAt = event.approvedAt
  if (event.status === 'paid') {
    void paymentApi.status(payment.value.referenceId).then(applySnapshot).catch(() => undefined)
    onPaid()
  }
}

const events = usePaymentEvents(
  () => payment.value?.referenceId ?? null,
  applySnapshot,
  applyEvent,
)

async function startPay(): Promise<void> {
  if (!order.value || paymentLoading.value) return
  paymentLoading.value = true
  payError.value = ''
  try {
    const snap = await paymentApi.create({ purpose: 'order', orderId: order.value._id })
    payment.value = snap.payment
    startClock()
    await events.start()
  } catch (err) {
    payError.value = err instanceof Error ? err.message : 'Could not start payment'
  } finally {
    paymentLoading.value = false
  }
}

async function retryPayment(): Promise<void> {
  if (!order.value) return
  paymentLoading.value = true
  payError.value = ''
  try {
    const snap = await paymentApi.retry(order.value._id)
    payment.value = snap.payment
    startClock()
    await events.start()
  } catch (err) {
    payError.value = err instanceof Error ? err.message : 'Could not generate a new QR'
  } finally {
    paymentLoading.value = false
  }
}

async function cancelPayment(): Promise<void> {
  if (!payment.value) return
  paymentLoading.value = true
  try {
    const snap = await paymentApi.cancel(payment.value.referenceId)
    payment.value = null
    events.stop()
    stopClock()
    // The backend also marks the order Cancelled — refresh so the page shows
    // the final state instead of a stale "Generate QR" button.
    order.value = snap.order ?? null
    if (!order.value) await refreshSilently()
    toast.info('Payment cancelled')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Could not cancel payment')
  } finally {
    paymentLoading.value = false
    pendingCancel.value = null
  }
}

/** Cancels an unpaid pending order that has no QR generated yet. */
async function cancelPendingOrder(): Promise<void> {
  if (!order.value) return
  actionId.value = order.value._id
  try {
    order.value = await ordersApi.cancel(order.value._id)
    toast.success(`Order #${order.value.orderNumber} cancelled`)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Failed to cancel order')
  } finally {
    actionId.value = null
    pendingCancel.value = null
  }
}

function onPaid(): void {
  if (paymentSuccessShown.value) return
  paymentSuccessShown.value = true
  celebrate()
  toast.success(`Order #${order.value?.orderNumber ?? ''} paid — processing started`)
  void refreshSilently()
}

const paymentSuccessShown = ref(false)

function openHostedCheckout(): void {
  if (payment.value?.checkoutUrl) window.open(payment.value.checkoutUrl, '_blank', 'noopener')
}

async function refreshFromProvider(): Promise<void> {
  const p = payment.value
  if (!p || isPayTerminal.value || paymentLoading.value) return
  try {
    applySnapshot(await paymentApi.verify(p.referenceId))
  } catch {
    /* non-fatal */
  }
}

function handleVisibilityChange(): void {
  if (document.visibilityState === 'visible') void refreshFromProvider()
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

let liveTimer: ReturnType<typeof setInterval> | null = null

watch(orderId, () => {
  order.value = null
  payment.value = null
  paymentSuccessShown.value = false
  stopClock()
  void load()
})

onMounted(() => {
  void load()
  // Live refresh: poll the order every 5s while it is still in flight.
  liveTimer = setInterval(() => {
    if (order.value && !isTerminal.value) void refreshSilently()
  }, 5000)
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

onUnmounted(() => {
  if (liveTimer) clearInterval(liveTimer)
  liveTimer = null
  stopClock()
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6">
    <!-- Header -->
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div class="flex items-center gap-3">
        <button
          class="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/60 transition-all hover:border-brand-400/40 hover:text-white"
          aria-label="Back to orders"
          @click="router.push('/dashboard/orders')"
        >
          <ArrowLeft class="h-4 w-4" />
        </button>
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <h1 class="font-display text-2xl font-bold text-white">
              Order #{{ order?.orderNumber ?? '…' }}
            </h1>
            <BaseBadge v-if="statusMeta" :tone="order?.status === 'Completed' ? 'success' : order?.status === 'Cancelled' || order?.status === 'Refunded' || order?.status === 'Failed' ? 'danger' : 'info'" dot>
              {{ order?.status }}
            </BaseBadge>
          </div>
          <p class="mt-1 text-sm text-white/50">Track delivery and manage payment.</p>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <span
          class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium"
          :class="isTerminal ? 'border-white/10 bg-white/5 text-white/40' : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'"
        >
          <span class="relative flex h-2 w-2">
            <span v-if="!isTerminal" class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span class="relative inline-flex h-2 w-2 rounded-full" :class="isTerminal ? 'bg-white/30' : 'bg-emerald-400'" />
          </span>
          {{ isTerminal ? 'Final' : 'Live' }}
        </span>
        <BaseButton variant="ghost" size="sm" :loading="refreshing" @click="refreshManually">
          <RefreshCw class="h-3.5 w-3.5" /> Refresh
        </BaseButton>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading && !order" class="space-y-4">
      <BaseSkeleton class="h-36 w-full rounded-3xl" />
      <BaseSkeleton class="h-72 w-full rounded-3xl" />
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <BaseSkeleton v-for="n in 6" :key="n" class="h-24 w-full rounded-2xl" />
      </div>
    </div>

    <!-- Load error -->
    <BaseEmptyState
      v-else-if="error && !order"
      :title="'Could not load this order'"
      :message="error"
    >
      <div class="mt-3 flex gap-3">
        <BaseButton variant="outline" size="sm" @click="router.push('/dashboard/orders')">
          <ArrowLeft class="h-4 w-4" /> Back to orders
        </BaseButton>
        <BaseButton size="sm" @click="load">Retry</BaseButton>
      </div>
    </BaseEmptyState>

    <template v-else-if="order">
      <!-- Service hero -->
      <div class="glass relative overflow-hidden rounded-2xl p-6 shadow-card">
        <div class="pointer-events-none absolute -right-14 -top-14 h-40 w-40 rounded-full bg-gradient-to-br opacity-10 blur-2xl" />
        <div class="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex min-w-0 items-start gap-4">
            <PlatformIcon :platform="orderPlatform" size="lg" tile class="shrink-0" />
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="font-display truncate text-lg font-semibold text-white">{{ serviceInfo?.name ?? 'Service' }}</h2>
                <BaseBadge tone="brand">{{ serviceTypeLabel }}</BaseBadge>
              </div>
              <p class="mt-1 flex items-center gap-1 text-xs text-brand-300">
                <ExternalLink class="h-3 w-3 shrink-0" />
                <button class="max-w-[420px] truncate underline-offset-2 hover:underline" :title="order.link" @click="openLink(order.link)">
                  {{ order.link || '—' }}
                </button>
              </p>
              <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/50">
                <span>Min {{ serviceInfo?.min.toLocaleString() ?? '—' }}</span>
                <span>Max {{ serviceInfo?.max.toLocaleString() ?? '—' }}</span>
                <span v-if="serviceInfo?.deliveryTime" class="inline-flex items-center gap-1">
                  <Clock class="h-3 w-3" /> {{ serviceInfo.deliveryTime }}
                </span>
                <span v-if="serviceInfo?.refill" class="inline-flex items-center gap-1 text-emerald-300">
                  <RefreshCcw class="h-3 w-3" /> Refill supported
                </span>
                <span v-if="order.params && Object.keys(order.params).length" class="truncate text-white/40">
                  Options: {{ Object.values(order.params).filter(Boolean).join(' · ') }}
                </span>
              </div>
            </div>
          </div>

          <div class="flex shrink-0 flex-col items-start gap-2 sm:items-end">
            <p class="font-display text-3xl font-bold text-white">{{ formatMoney(order.totalPrice) }}</p>
            <p class="text-xs text-white/40">Provider #{{ order.providerOrderId ?? '—' }}</p>
          </div>
        </div>
      </div>

      <!-- Full-screen timeline -->
      <div class="glass rounded-2xl p-6 shadow-card sm:p-8">
        <div class="mb-6 flex items-center justify-between gap-3">
          <h3 class="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-white/40">
            <TrendingUp class="h-4 w-4" /> Order timeline
          </h3>
          <span v-if="delivered !== null" class="text-sm font-semibold text-emerald-300">{{ deliveryPct }}% delivered</span>
        </div>
        <OrderStatusTimeline :order="order" size="lg" />
      </div>

      <!-- Progress analytics -->
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="item in analytics"
          :key="item.label"
          class="glass rounded-2xl px-5 py-4 shadow-card"
        >
          <p class="text-xs font-medium uppercase tracking-wider text-white/40">{{ item.label }}</p>
          <p class="font-display mt-1.5 text-lg font-bold" :class="item.accent ? 'text-emerald-300' : 'text-white'">
            {{ item.value }}
          </p>
        </div>
      </div>

      <!-- Payment (inline KHQR re-pay) -->
      <div v-if="canPay" class="glass rounded-2xl p-6 shadow-card sm:p-8">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h3 class="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-white/40">
            <QrCode class="h-4 w-4" /> Pay with KHQR
          </h3>
          <BaseButton v-if="payment" variant="ghost" size="sm" @click="router.push(`/pay/${payment.referenceId}`)">
            <ExternalLink class="h-3.5 w-3.5" /> Full checkout
          </BaseButton>
        </div>

        <!-- No QR yet -->
        <div v-if="!payment" class="mt-6 flex flex-col items-center gap-4 py-6 text-center">
          <div class="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-500/15 text-brand-300">
            <QrCode class="h-8 w-8" />
          </div>
          <div>
            <p class="font-semibold text-white">This order is waiting for payment</p>
            <p class="mt-1 text-sm text-white/50">
              {{ formatMoney(order.totalPrice) }} — generate a QR and scan it with Bakong or any KHQR banking app.
            </p>
          </div>
          <BaseButton :loading="paymentLoading" @click="startPay">
            <CreditCard class="h-4 w-4" /> Generate QR
          </BaseButton>
          <button
            class="text-xs font-medium text-white/40 transition-colors hover:text-white"
            :disabled="actionId === order._id"
            @click="pendingCancel = 'order'"
          >
            Cancel this order instead
          </button>
        </div>

        <!-- QR card -->
        <div v-else class="mt-6 grid items-start gap-6 lg:grid-cols-[280px_1fr]">
          <!-- White KHQR card -->
          <div class="mx-auto w-full max-w-[280px] overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div class="relative overflow-hidden bg-[#E41A2B] px-5 py-3.5">
              <div class="absolute inset-0 bg-black/10" />
              <div class="relative flex items-center justify-between">
                <span class="text-xl font-black italic tracking-widest text-white drop-shadow-sm">KHQR</span>
                <span class="flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 text-[9px] font-bold tracking-wider text-white">
                  <QrCode class="h-3 w-3" /> SCAN TO PAY
                </span>
              </div>
            </div>
            <div class="flex flex-col items-center p-6">
              <p class="text-[10px] font-bold uppercase tracking-widest text-gray-400">Amount (USD)</p>
              <p class="mt-1 text-3xl font-black tracking-tight text-gray-900">
                {{ formatMoney(payment.amount).replace('$', '') }}
              </p>

              <div class="relative mt-4 w-full max-w-[180px] bg-white">
                <div v-if="payStatus === 'expired'" class="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/80 backdrop-blur-sm">
                  <span class="rounded-full bg-gray-900 px-3 py-1.5 text-xs font-bold text-white">EXPIRED</span>
                </div>
                <img v-if="payment.qrCodeDataUrl" :src="payment.qrCodeDataUrl" alt="KHQR" class="w-full rounded-lg border border-gray-100 object-contain" />
              </div>

              <div class="mt-4 flex w-full items-center justify-between">
                <div class="flex items-center gap-1.5">
                  <span class="relative flex h-2 w-2">
                    <span class="live-ring absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
                    <span class="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                  <span class="text-[11px] font-semibold text-gray-600">
                    {{ isPaid ? 'Paid' : 'Waiting for payment' }}
                  </span>
                </div>
                <span class="flex items-center gap-1 text-xs font-bold tabular-nums" :class="countdownDanger ? 'text-red-500' : 'text-gray-500'">
                  <Clock class="h-3.5 w-3.5" /> {{ countdown.mins }}:{{ countdown.secs }}
                </span>
              </div>
            </div>
          </div>

          <!-- Pay panel -->
          <div class="space-y-4">
            <div v-if="!isPaid" class="space-y-3 text-sm text-white/60">
              <p class="flex items-center gap-2">
                <Zap class="h-4 w-4 text-brand-300" />
                Open Bakong or any KHQR bank app, scan the code and confirm {{ formatMoney(payment.amount) }}.
              </p>
              <p class="flex items-center gap-2">
                <Timer class="h-4 w-4 text-white/40" />
                The page updates automatically the moment payment settles — no refresh needed.
              </p>

              <div
                v-if="payStatus === 'expired' || payStatus === 'failed'"
                class="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
              >
                {{ payStatus === 'expired' ? 'QR expired — no money was charged.' : 'Payment failed — no money was charged.' }}
              </div>

              <div class="flex flex-wrap gap-2 pt-2">
                <BaseButton v-if="payStatus === 'expired' || payStatus === 'failed'" :loading="paymentLoading" @click="retryPayment">
                  <RefreshCcw class="h-4 w-4" /> Generate new QR
                </BaseButton>
                <BaseButton v-if="payment.checkoutUrl" variant="outline" size="sm" @click="openHostedCheckout">
                  <ExternalLink class="h-3.5 w-3.5" /> Open secure checkout
                </BaseButton>
                <BaseButton variant="ghost" size="sm" @click="copyText(payment.referenceId, 'Reference')">
                  <Copy class="h-3.5 w-3.5" /> Copy ref
                </BaseButton>
                <button
                  v-if="!isPayTerminal"
                  class="ml-auto text-xs font-medium text-white/40 transition-colors hover:text-white"
                  :disabled="paymentLoading"
                  @click="pendingCancel = 'payment'"
                >
                  Cancel transaction
                </button>
              </div>
              <p v-if="payError" class="text-sm text-rose-300">{{ payError }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Real-time payment success (stays visible even after the order flips to Processing) -->
      <div
        v-if="paymentSuccessShown && order"
        class="flex items-center gap-2 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-5 py-4 text-sm font-medium text-emerald-200"
      >
        <CheckCircle2 class="h-5 w-5 shrink-0" />
        Payment received — order #{{ order.orderNumber }} is now processing. 🎉
      </div>

      <!-- Paid-but-not-processing note -->
      <div
        v-if="order.status === 'Paid' && order.error"
        class="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-5 py-4 text-sm text-amber-200"
      >
        Payment received, but the order could not be placed yet. We retry automatically — if this persists, contact support.
        <p class="mt-1 text-xs text-amber-200/60">{{ order.error }}</p>
      </div>

      <!-- Error from provider -->
      <p v-if="order.error && order.status !== 'Paid'" class="text-sm text-rose-300">{{ order.error }}</p>

      <!-- Actions -->
      <div class="flex flex-wrap items-center gap-2">
        <BaseButton
          v-if="canCancel"
          variant="outline"
          :loading="actionId === order._id"
          @click="cancelOrder"
        >
          <XCircle class="h-4 w-4" /> Cancel order
        </BaseButton>
        <BaseButton
          v-if="canRefill"
          variant="outline"
          :loading="actionId === order._id"
          @click="requestRefill"
        >
          <RefreshCcw class="h-4 w-4" /> Request refill
        </BaseButton>
        <BaseButton variant="ghost" class="ml-auto" @click="router.push('/dashboard/services')">
          <ExternalLink class="h-4 w-4" /> New order
        </BaseButton>
      </div>

      <!-- Cancel confirmation -->
      <BaseModal
        :open="pendingCancel !== null"
        :title="pendingCancel === 'payment' ? 'Cancel payment?' : 'Cancel order?'"
        max-width="max-w-sm"
        @close="pendingCancel = null"
      >
        <div class="space-y-4">
          <p class="text-sm leading-relaxed text-white/60">
            {{
              pendingCancel === 'payment'
                ? 'The QR code will be voided and this order will be cancelled. No money has been charged — you can place a new order anytime.'
                : 'This unpaid order will be cancelled. Nothing has been charged — you can place a new order anytime.'
            }}
          </p>
          <div class="flex justify-end gap-2">
            <BaseButton variant="ghost" @click="pendingCancel = null">Keep order</BaseButton>
            <BaseButton
              variant="danger"
              :loading="pendingCancel === 'payment' ? paymentLoading : actionId === (order?._id ?? null)"
              @click="pendingCancel === 'payment' ? cancelPayment() : cancelPendingOrder()"
            >
              {{ pendingCancel === 'payment' ? 'Cancel payment' : 'Cancel order' }}
            </BaseButton>
          </div>
        </div>
      </BaseModal>
    </template>
  </div>
</template>

<style scoped>
.live-ring {
  animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
}
@keyframes ping {
  75%,
  100% {
    transform: scale(2.5);
    opacity: 0;
  }
}
</style>
