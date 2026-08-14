<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import confetti from 'canvas-confetti'
import {
  ArrowLeft,
  Clock,
  Copy,
  ExternalLink,
  Loader2,
  Lock,
  QrCode,
  RefreshCcw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Wallet,
  X,
} from '@lucide/vue'
import { paymentApi, type PaymentStatusResponse } from '@/api/payment.api'
import { usePaymentEvents, type PaymentLiveEvent } from '@/composables/usePaymentEvents'
import { useToast } from '@/composables/useToast'
import { formatMoney, formatNumber, orderServiceName } from '@/utils/format'
import { buildAbaDeepLink, isTouchDevice } from '@/utils/deepLink'
import { detectPlatform, type DetectedPlatform } from '@/utils/linkValidation'
import PlatformIcon from '@/components/ui/PlatformIcon.vue'
import BrandLogo from '@/components/layout/BrandLogo.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseSkeleton from '@/components/ui/BaseSkeleton.vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import type { Order, Payment } from '@/types/models'

const route = useRoute()
const router = useRouter()
const toast = useToast()

const reference = computed(() => String(route.params.reference ?? ''))

const payment = ref<Payment | null>(null)
const order = ref<Order | null>(null)
const loading = ref(true)
const error = ref('')
const actionBusy = ref(false)
const confirmCancelOpen = ref(false)
/** True while a manual cancel is in flight — suppress the SSE-expired auto-close. */
const manualCancel = ref(false)

const status = computed(() => payment.value?.status ?? 'pending')
const isPaid = computed(() => status.value === 'paid')
const isTerminal = computed(() => ['paid', 'expired', 'failed', 'refunded'].includes(status.value))
const isOrder = computed(() => payment.value?.purpose === 'order')

// ---------------------------------------------------------------------------
// Auto-close on expiry
// ---------------------------------------------------------------------------

const closingIn = ref<number | null>(null)
let closeTimer: ReturnType<typeof setInterval> | null = null

function startCloseCountdown(seconds = 10): void {
  stopCloseCountdown()
  closingIn.value = seconds
  closeTimer = setInterval(() => {
    if (closingIn.value === null || closingIn.value <= 1) {
      stopCloseCountdown()
      router.push(isOrder.value ? '/dashboard/orders' : '/dashboard/wallet')
      return
    }
    closingIn.value -= 1
  }, 1000)
}

function stopCloseCountdown(): void {
  if (closeTimer) clearInterval(closeTimer)
  closeTimer = null
  closingIn.value = null
}

watch(status, (s) => {
  if (manualCancel.value) return
  if ((s === 'expired' || s === 'failed') && !isPaid.value) startCloseCountdown()
})

// ---------------------------------------------------------------------------
// Countdown
// ---------------------------------------------------------------------------

const now = ref(Date.now())
const countdown = computed(() => {
  if (!payment.value?.expiresAt) return { total: 0, mins: '00', secs: '00', expired: false }
  const diff = Math.max(0, new Date(payment.value.expiresAt).getTime() - now.value)
  const expired = diff <= 0 && !isPaid.value
  const total = Math.floor(diff / 1000)
  return {
    total,
    mins: String(Math.floor(total / 60)).padStart(2, '0'),
    secs: String(total % 60).padStart(2, '0'),
    expired,
  }
})
let timer: ReturnType<typeof setInterval> | null = null

function startClock(): void {
  stopClock()
  now.value = Date.now()
  timer = setInterval(() => (now.value = Date.now()), 1000)
}
function stopClock(): void {
  if (timer) clearInterval(timer)
  timer = null
}

// ---------------------------------------------------------------------------
// Live status (SSE + polling)
// ---------------------------------------------------------------------------

function applySnapshot(snap: PaymentStatusResponse): void {
  payment.value = snap.payment
  order.value = snap.order
  loading.value = false
  if (snap.payment.status === 'paid') showSuccess()
}

function applyEvent(event: PaymentLiveEvent): void {
  if (!payment.value) return
  payment.value.status = event.status as Payment['status']
  if (event.approvedAt) payment.value.approvedAt = event.approvedAt
  if (event.status === 'paid') {
    void paymentApi.status(reference.value).then(applySnapshot).catch(() => undefined)
    showSuccess()
  }
}

const events = usePaymentEvents(() => reference.value, applySnapshot, applyEvent)

function celebrate(): void {
  void confetti({
    particleCount: 140,
    spread: 75,
    origin: { y: 0.7 },
    colors: ['#E41A2B', '#00E5FF', '#3B82F6', '#ffffff'],
  })
  void confetti({ particleCount: 60, angle: 60, spread: 60, origin: { x: 0, y: 0.7 } })
  void confetti({ particleCount: 60, angle: 120, spread: 60, origin: { x: 1, y: 0.7 } })
}

// ---------------------------------------------------------------------------
// Success: one subtle toast, then auto-redirect after a few seconds
// ---------------------------------------------------------------------------

const successToastShown = ref(false)
const redirectIn = ref<number | null>(null)
let redirectTimer: ReturnType<typeof setInterval> | null = null

const REDIRECT_AFTER_S = 6

function showSuccess(): void {
  if (successToastShown.value) return
  successToastShown.value = true

  celebrate()

  if (isOrder.value) {
    toast.success(`Order ${order.value?.orderNumber ? `#${order.value.orderNumber} ` : ''}paid — processing started`)
  } else {
    toast.success(`${formatMoney(payment.value?.amount ?? 0)} added to your wallet`)
  }

  startRedirectCountdown(REDIRECT_AFTER_S)
}

function startRedirectCountdown(seconds: number): void {
  stopRedirectCountdown()
  redirectIn.value = seconds
  redirectTimer = setInterval(() => {
    if (redirectIn.value === null) return
    redirectIn.value -= 1
    if (redirectIn.value <= 0) {
      stopRedirectCountdown()
      void router.push(isOrder.value ? '/dashboard/orders' : '/dashboard/wallet')
    }
  }, 1000)
}

function stopRedirectCountdown(): void {
  if (redirectTimer) clearInterval(redirectTimer)
  redirectTimer = null
  redirectIn.value = null
}

async function init(): Promise<void> {
  if (!reference.value) {
    error.value = 'Missing payment reference'
    loading.value = false
    return
  }
  stopCloseCountdown()
  loading.value = true
  error.value = ''
  try {
    // Use VERIFY (forces a live CutLuy check), not the cached status read:
    // when the customer refreshes after paying — or returns from their
    // bank app — we must query the provider NOW. A stale cached 'pending'
    // is exactly what left the page stuck on the KHQR after payment.
    const snap = await paymentApi.verify(reference.value)
    applySnapshot(snap)
    startClock()
    events.start()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load payment'
    loading.value = false
  }
}

/**
 * Re-verifies with the provider the moment the customer returns to this
 * tab — e.g. after switching to their bank app to scan & pay. Without this,
 * the success screen waits for the next poll cycle even though the charge
 * already settled; with it, success appears the instant they tab back.
 */
let verifying = false
async function refreshFromProvider(): Promise<void> {
  if (isTerminal.value || !payment.value || verifying) return
  verifying = true
  try {
    const snap = await paymentApi.verify(reference.value)
    applySnapshot(snap)
  } catch {
    /* non-fatal — polling continues */
  } finally {
    verifying = false
  }
}

function handleVisibilityChange(): void {
  if (document.visibilityState === 'visible') {
    void refreshFromProvider()
  }
}

watch(reference, () => {
  payment.value = null
  order.value = null
  successToastShown.value = false
  stopRedirectCountdown()
  void init()
})

function handleBeforeUnload(): void {
  events.stop()
}

onMounted(() => {
  void init()
  window.addEventListener('beforeunload', handleBeforeUnload)
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

onUnmounted(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  stopCloseCountdown()
  stopRedirectCountdown()
})

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function copyText(text: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${label} copied`)
  } catch {
    toast.error('Could not copy — select the text manually')
  }
}

async function cancelPayment(): Promise<void> {
  if (!payment.value) return
  actionBusy.value = true
  manualCancel.value = true
  try {
    await paymentApi.cancel(payment.value.referenceId)
    toast.info('Payment cancelled')
    // Stop the live stream + timers: the backend already emitted 'expired',
    // and the page is about to leave anyway.
    events.stop()
    stopClock()
    stopCloseCountdown()
    router.push(isOrder.value ? '/dashboard/orders' : '/dashboard/wallet')
  } catch (err) {
    manualCancel.value = false
    toast.error(err instanceof Error ? err.message : 'Could not cancel payment')
  } finally {
    actionBusy.value = false
    confirmCancelOpen.value = false
  }
}

async function retryPayment(): Promise<void> {
  if (!order.value) return
  actionBusy.value = true
  try {
    const snap = await paymentApi.retry(order.value._id)
    await router.replace(`/pay/${snap.payment.referenceId}`)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Could not generate a new QR')
  } finally {
    actionBusy.value = false
  }
}

function openHostedCheckout(): void {
  if (payment.value?.checkoutUrl) window.open(payment.value.checkoutUrl, '_blank', 'noopener')
}

function openBankApp(bank: { id: string }): void {
  const paymentValue = payment.value
  if (!paymentValue) return
  if (bank.id === 'aba' && paymentValue.qrString && isTouchDevice()) {
    window.location.href = buildAbaDeepLink(paymentValue.qrString)
    return
  }
  openHostedCheckout()
}

function canOpenBank(bank: { id: string }): boolean {
  const paymentValue = payment.value
  if (!paymentValue) return false
  if (bank.id === 'aba') return Boolean(paymentValue.qrString && isTouchDevice() || paymentValue.checkoutUrl)
  return Boolean(paymentValue.checkoutUrl)
}

const banks = [
  { id: 'aba', short: 'ABA', name: 'ABA Bank', color: '#E4002B' },
  { id: 'bakong', short: 'B', name: 'Bakong', color: '#0E7C7B' },
  { id: 'acleda', short: 'A', name: 'ACLEDA', color: '#1B3F8F' },
  { id: 'wing', short: 'W', name: 'Wing', color: '#E30613' },
]

function serviceName(): string {
  if (!order.value) return ''
  return orderServiceName(order.value.service)
}

/** Platform of the ordered service — from its category or the pasted link. */
const orderPlatform = computed<DetectedPlatform>(() => {
  const o = order.value
  if (!o) return 'other'
  const cat = o.service
  if (cat && typeof cat === 'object' && 'platform' in cat) {
    const p = (cat as { platform: string }).platform
    if (p !== 'other') return p as DetectedPlatform
  }
  return detectPlatform(o.link)
})

const countdownDanger = computed(() => countdown.value.total > 0 && countdown.value.total <= 60)
const waitingCopy = 'Waiting for payment…'
</script>

<template>
  <div class="relative min-h-screen overflow-hidden bg-surface text-ink font-sans">
    <!-- Ambient background -->
    <div class="pointer-events-none absolute inset-0 overflow-hidden">
      <div class="absolute -top-40 left-1/4 h-[480px] w-[480px] rounded-full bg-brand-600/20 blur-[120px]" />
      <div class="absolute bottom-0 right-0 h-[420px] w-[420px] rounded-full bg-rose-600/10 blur-[120px]" />
      <div class="bg-grid absolute inset-0 opacity-[0.05]" />
    </div>

    <div class="relative mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
      <!-- Header -->
      <header class="flex items-center justify-between mb-8">
        <RouterLink to="/dashboard" class="transition-opacity hover:opacity-80">
          <BrandLogo size="sm" />
        </RouterLink>
        <div class="flex items-center gap-2 rounded-full border border-ink/10 bg-ink/5 px-4 py-1.5 text-xs font-medium text-ink/70 backdrop-blur">
          <Lock class="h-3.5 w-3.5 text-emerald-400" />
          Secure checkout
        </div>
      </header>

      <!-- Loading -->
      <div v-if="loading" class="mx-auto mt-16 w-full max-w-3xl space-y-4">
        <BaseSkeleton class="h-36 w-full rounded-2xl" />
        <div class="grid gap-4 sm:grid-cols-2">
          <BaseSkeleton class="h-56 w-full rounded-2xl" />
          <BaseSkeleton class="h-56 w-full rounded-2xl" />
        </div>
      </div>

      <!-- Load error -->
      <div v-else-if="error && !payment" class="mx-auto mt-24 max-w-md text-center">
        <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-300">
          <X class="h-8 w-8" />
        </div>
        <h2 class="mt-5 text-xl font-bold text-ink">Could not load this payment</h2>
        <p class="mt-2 text-sm text-ink/50">{{ error }}</p>
        <div class="mt-6 flex justify-center gap-3">
          <BaseButton variant="outline" @click="router.push('/dashboard')">
            <ArrowLeft class="h-4 w-4" /> Dashboard
          </BaseButton>
          <BaseButton @click="init">Retry</BaseButton>
        </div>
      </div>

      <!-- Success state -->
      <div v-else-if="isPaid" class="mx-auto mt-16 w-full max-w-lg text-center">
        <div class="check-pop mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-[0_0_60px_-8px_rgba(52,211,153,0.8)]">
          <svg viewBox="0 0 52 52" class="h-10 w-10">
            <path
              class="checkmark"
              fill="none"
              d="M14 27 l8 8 l16 -16"
              stroke="#fff"
              stroke-width="5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>
        <h1 class="font-display mt-4 text-2xl font-bold text-ink">
          Payment Successful 🎉
        </h1>
        <p class="mt-3 text-ink/60">
          {{ isOrder ? `Order #${order?.orderNumber ?? ''} is now processing.` : 'Your balance has been topped up.' }}
          <span class="font-semibold text-emerald-400">{{ formatMoney(payment?.amount ?? 0) }}</span> paid.
        </p>

        <div v-if="isOrder && order" class="glass mx-auto mt-6 max-w-sm space-y-3 rounded-2xl p-6 text-left text-sm border border-ink/5 bg-ink/5 backdrop-blur-md">
          <div class="flex items-center justify-between gap-3">
            <span class="shrink-0 text-ink/50">Service</span>
            <span class="flex min-w-0 items-center gap-2 font-medium text-ink">
              <PlatformIcon v-if="orderPlatform !== 'other'" :platform="orderPlatform" size="xs" tile />
              <span class="truncate">{{ serviceName() }}</span>
            </span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-ink/50">Quantity</span>
            <span class="font-medium text-ink">{{ formatNumber(order.quantity) }}</span>
          </div>
          <div class="flex items-center justify-between border-t border-ink/10 pt-3">
            <span class="text-ink/50">Reference</span>
            <span class="font-mono text-xs text-ink/80">{{ payment?.referenceId }}</span>
          </div>
        </div>

        <p v-if="redirectIn !== null && redirectIn > 0" class="mt-6 flex items-center justify-center gap-2 text-sm text-ink/50">
          <Loader2 class="h-4 w-4 animate-spin" />
          Redirecting in {{ redirectIn }}s…
        </p>

        <div class="mt-8 flex flex-wrap justify-center gap-3">
          <BaseButton variant="outline" @click="stopRedirectCountdown(); router.push(isOrder ? '/dashboard/orders' : '/dashboard/wallet')">
            <ArrowLeft class="h-4 w-4" /> Go to Dashboard
          </BaseButton>
          <BaseButton v-if="isOrder && order" variant="outline" @click="stopRedirectCountdown(); router.push(`/dashboard/orders/${order._id}`)">
            <ExternalLink class="h-4 w-4" /> View Order
          </BaseButton>
          <BaseButton variant="secondary" @click="stopRedirectCountdown(); router.push('/dashboard/services')">
            <Sparkles class="h-4 w-4" /> New Order
          </BaseButton>
        </div>
      </div>

      <!-- Checkout -->
      <div v-else class="mx-auto mt-6 w-full max-w-5xl">
        <div class="grid items-start gap-10 lg:grid-cols-[1fr_420px]">
          
          <!-- Left: Order Summary & Actions -->
          <div class="space-y-6 lg:py-4">
            <div>
              <h2 class="text-2xl font-bold tracking-tight text-ink mb-2">Complete Payment</h2>
              <p class="text-ink/50 text-sm">Scan the KHQR code using any supported Cambodian banking app.</p>
            </div>

            <div class="rounded-2xl border border-ink/10 bg-ink/5 p-5 backdrop-blur-md">
              <h3 class="text-sm font-semibold text-ink/40 uppercase tracking-wider mb-4">Summary</h3>
              
              <div v-if="isOrder && order" class="space-y-4 text-sm">
                <div class="flex items-center justify-between gap-3">
                  <span class="shrink-0 text-ink/60">Service</span>
                  <span class="flex min-w-0 items-center justify-end gap-2 font-medium text-ink">
                    <PlatformIcon v-if="orderPlatform !== 'other'" :platform="orderPlatform" size="xs" tile />
                    <span class="truncate">{{ serviceName() }}</span>
                  </span>
                </div>
                <div v-if="order.link" class="flex items-center justify-between">
                  <span class="text-ink/60">Target</span>
                  <span class="truncate text-ink/80 max-w-[60%]">{{ order.link }}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-ink/60">Quantity</span>
                  <span class="font-medium text-ink">{{ formatNumber(order.quantity) }}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-ink/60">Rate / 1,000</span>
                  <span class="text-ink/80">{{ formatMoney(order.pricePerUnit) }}</span>
                </div>
              </div>
              
              <div v-else class="flex items-center gap-3 text-sm font-medium text-ink/80">
                <Wallet class="h-5 w-5 text-brand-400" />
                Wallet Balance Top-up
              </div>

              <div class="mt-6 flex items-end justify-between border-t border-ink/10 pt-6">
                <span class="text-ink/60">Total to pay</span>
                <span class="font-display text-3xl font-black text-ink tracking-tight">
                  {{ formatMoney(payment?.amount ?? 0) }}
                </span>
              </div>
            </div>

            <!-- Expired / failed state -->
            <div v-if="status === 'expired' || status === 'failed'" class="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5">
              <p class="font-semibold text-rose-300">
                {{ status === 'expired' ? 'QR Code Expired' : 'Payment Failed' }}
              </p>
              <p class="mt-1 text-sm text-ink/60">
                No money was charged. Generate a new QR to try again.
              </p>
              <BaseButton v-if="isOrder && order" class="mt-4 w-full" :loading="actionBusy" @click="retryPayment">
                <RefreshCcw class="h-4 w-4" /> Generate New QR
              </BaseButton>
              <BaseButton v-else class="mt-4 w-full" :loading="actionBusy" @click="router.push('/dashboard/wallet')">
                Back to Wallet
              </BaseButton>
            </div>

            <!-- Cancel -->
            <button
              v-if="status === 'pending' || status === 'scanned'"
              class="text-sm font-medium text-ink/40 transition-colors hover:text-ink"
              :disabled="actionBusy"
              @click="confirmCancelOpen = true"
            >
              Cancel transaction
            </button>
          </div>

          <!-- Cancel confirmation -->
          <BaseModal :open="confirmCancelOpen" title="Cancel this payment?" max-width="max-w-sm" @close="confirmCancelOpen = false">
            <div class="space-y-4">
              <p class="text-sm leading-relaxed text-ink/60">
                No money has been charged. {{ isOrder ? 'The order will be cancelled and you will be returned to your orders.' : 'You will be returned to your wallet.' }}
              </p>
              <div class="flex justify-end gap-2">
                <BaseButton variant="ghost" :disabled="actionBusy" @click="confirmCancelOpen = false">Keep order</BaseButton>
                <BaseButton variant="danger" :loading="actionBusy" @click="cancelPayment">Cancel payment</BaseButton>
              </div>
            </div>
          </BaseModal>

          <!-- Right: Authentic KHQR Terminal Card -->
          <div class="relative w-full max-w-[400px] mx-auto">
            <!-- The Card -->
            <div class="bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-ink/10 ring-1 ring-black/5">
              
              <!-- Standard KHQR Red Header -->
              <div class="bg-[#E41A2B] px-6 py-4 flex items-center justify-between relative overflow-hidden">
                <div class="absolute inset-0 bg-black/10"></div>
                <div class="relative flex items-center gap-2">
                  <span class="font-black text-2xl italic tracking-widest text-white drop-shadow-sm">KHQR</span>
                </div>
                <div class="relative flex items-center gap-1.5 bg-black/25 px-3 py-1 rounded-full">
                  <QrCode class="h-3.5 w-3.5 text-white" />
                  <span class="text-[10px] font-bold text-white tracking-wider">SCAN TO PAY</span>
                </div>
              </div>

              <!-- Card Body (White) -->
              <div class="p-6 flex flex-col items-center">
                
                <p class="text-[11px] font-bold tracking-widest text-gray-400 uppercase mb-1">Pay to Merchant</p>
                <h3 class="text-xl font-bold text-gray-900 mb-6">DigitalSMM</h3>

                <!-- Authentic Amount Display -->
                <div class="text-center mb-6">
                  <div class="flex items-start justify-center text-gray-900">
                    <span class="text-2xl font-bold mt-1.5 mr-1">$</span>
                    <span class="text-5xl font-black tracking-tighter">
                      {{ formatMoney(payment?.amount ?? 0).replace('$', '') }}
                    </span>
                  </div>
                  <p class="text-gray-500 text-xs font-medium mt-1 uppercase tracking-widest">USD Currency</p>
                </div>

                <!-- The QR Code Image Container -->
                <div class="relative w-full aspect-square max-w-[240px] bg-white rounded-2xl border-2 border-gray-100 p-3 shadow-sm mb-6 flex items-center justify-center">
                  <!-- Expiration blur overlay -->
                  <div v-if="status === 'expired'" class="absolute inset-0 z-10 backdrop-blur-sm bg-ink/70 rounded-2xl flex items-center justify-center">
                    <span class="bg-gray-900 px-4 py-2 rounded-full text-sm font-bold text-white shadow-lg">EXPIRED</span>
                  </div>

                  <img
                    v-if="payment?.qrCodeDataUrl"
                    :src="payment.qrCodeDataUrl"
                    alt="KHQR"
                    class="w-full h-full object-contain"
                  />
                  <div v-else-if="payment?.checkoutUrl" class="text-center p-4">
                    <ExternalLink class="h-10 w-10 text-gray-300 mx-auto mb-3" />
                    <p class="text-sm font-medium text-gray-500">External checkout link generated.</p>
                  </div>
                  <div v-else class="flex items-center justify-center">
                    <Loader2 class="h-10 w-10 animate-spin text-gray-300" />
                  </div>
                  
                  <!-- KHQR logo overlay on QR (simulated) -->
                  <div v-if="payment?.qrCodeDataUrl" class="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div class="bg-white p-1.5 rounded-lg shadow-sm border border-gray-100">
                       <div class="bg-[#E41A2B] text-white text-[9px] font-black italic px-1.5 py-0.5 rounded-sm tracking-wide">KHQR</div>
                    </div>
                  </div>
                </div>

                <!-- Clean Status & Countdown -->
                <div class="w-full flex items-center justify-between px-2">
                  <div class="flex items-center gap-2">
                    <span class="relative flex h-2 w-2">
                      <span class="live-ring absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                      <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span class="text-xs font-semibold text-gray-600">{{ waitingCopy }}</span>
                  </div>

                  <div 
                    class="flex items-center gap-1.5 text-sm font-bold transition-colors"
                    :class="countdownDanger ? 'text-red-500' : 'text-gray-500'"
                  >
                    <Clock class="h-4 w-4" />
                    <span class="tabular-nums tracking-tight">{{ countdown.mins }}:{{ countdown.secs }}</span>
                  </div>
                </div>
                
              </div>
              
              <!-- Footer Strip -->
              <div class="bg-gray-50 border-t border-gray-100 py-3 text-center">
                <div class="flex items-center justify-center gap-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  <ShieldCheck class="h-3.5 w-3.5 text-gray-400" />
                  Secured by {{ payment?.provider === 'abapayway' ? 'ABA PayWay' : 'Bakong' }}
                </div>
              </div>
            </div>

            <!-- Deep Link Bank Chips (Moved out of the white card to fit app theme) -->
            <div class="mt-6">
              <p class="text-xs font-medium text-ink/50 text-center mb-3 uppercase tracking-wider">Or open app directly</p>
              <div class="grid grid-cols-4 gap-2">
                <button
                  v-for="bank in banks"
                  :key="bank.id"
                  class="group flex flex-col items-center justify-center gap-2 rounded-2xl bg-ink/5 border border-ink/10 py-3 transition-all hover:bg-ink/10 active:scale-95"
                  :disabled="!canOpenBank(bank)"
                  @click="openBankApp(bank)"
                >
                  <span
                    class="flex h-8 w-8 items-center justify-center rounded-full text-xs font-black text-white shadow-sm"
                    :style="{ backgroundColor: bank.color }"
                  >
                    {{ bank.short }}
                  </span>
                  <span class="text-[10px] font-medium text-ink/60 group-hover:text-ink">
                    {{ bank.name }}
                  </span>
                </button>
              </div>
              <p class="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-ink/40">
                <Smartphone class="h-3.5 w-3.5" />
                Mobile apps open with amount pre-filled
              </p>
            </div>

            <!-- Utility Actions -->
            <div class="mt-5 grid grid-cols-2 gap-3">
              <button
                class="flex items-center justify-center gap-2 rounded-xl bg-ink/5 py-3 text-xs font-semibold text-ink/70 transition-colors hover:bg-ink/10 hover:text-ink"
                @click="copyText(formatMoney(payment?.amount ?? 0), 'Amount')"
              >
                <Copy class="h-4 w-4" /> Copy Amount
              </button>
              <button
                class="flex items-center justify-center gap-2 rounded-xl bg-ink/5 py-3 text-xs font-semibold text-ink/70 transition-colors hover:bg-ink/10 hover:text-ink"
                @click="copyText(payment?.referenceId ?? '', 'Reference')"
              >
                <Copy class="h-4 w-4" /> Copy Ref
              </button>
            </div>

            <BaseButton
              v-if="payment?.checkoutUrl"
              class="mt-4 w-full"
              variant="secondary"
              size="lg"
              @click="openHostedCheckout"
            >
              <ExternalLink class="h-4 w-4" />
              {{ payment.method === 'ABA' ? 'Pay with ABA PayWay' : 'Open Secure Checkout' }}
            </BaseButton>
            
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.live-ring {
  animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
}
@keyframes ping {
  75%, 100% {
    transform: scale(2.5);
    opacity: 0;
  }
}
.check-pop {
  animation: check-pop 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) both;
}
@keyframes check-pop {
  0% { transform: scale(0.5); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}
.checkmark {
  stroke-dasharray: 48;
  stroke-dashoffset: 48;
  animation: draw 0.5s ease-out 0.4s forwards;
}
@keyframes draw {
  to { stroke-dashoffset: 0; }
}
</style>