<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import confetti from 'canvas-confetti'
import {
  Clock,
  ExternalLink,
  Loader2,
  ShieldCheck,
  X,
} from '@lucide/vue'
import { paymentApi, type PaymentStatusResponse } from '@/api/payment.api'
import { usePaymentEvents, type PaymentLiveEvent } from '@/composables/usePaymentEvents'
import { useToast } from '@/composables/useToast'
import { event } from '@/analytics'
import { formatMoney } from '@/utils/format'
import BaseButton from '@/components/ui/BaseButton.vue'
import type { Payment } from '@/types/models'

const props = withDefaults(
  defineProps<{
    open: boolean
    payment: Payment | null
  }>(),
  {},
)

const emit = defineEmits<{
  close: []
  paid: [payment: Payment]
}>()

const toast = useToast()

/** The payment as it lives — updated by SSE events, provider verify, and
 *  the polling safety net (never trust the initial snapshot only). */
const live = ref<Payment | null>(null)

// Per-payment lifecycle state. Declared BEFORE the immediate props watcher
// below: with `{ immediate: true }` the watcher runs synchronously during
// setup, and a TDZ reference to any of these (e.g. when the component
// re-mounts with a payment already set, as happens on a Vite HMR reload)
// throws inside setup, corrupts the render tree, and surfaces later as
// `instance.update is not a function` in the patcher.
let settled = false
const successShown = ref(false)
const closingIn = ref<number | null>(null)
// Guard for the provider re-verify (also referenced by refreshFromProvider,
// which can run synchronously during setup via the immediate open watch).
let verifying = false

// Force-verify cadence. Declared BEFORE the immediate watchers below: the
// open watcher's else-branch calls stopVerifyLoop() synchronously during
// setup when the modal mounts closed (page load), and a TDZ reference to
// `verifyTimer` here would throw and kill the whole page — the same
// `instance.update is not a function` crash family as before.
const VERIFY_INTERVAL_MS = 3000

let verifyTimer: ReturnType<typeof setInterval> | null = null
function startVerifyLoop(): void {
  stopVerifyLoop()
  verifyTimer = setInterval(() => void refreshFromProvider(), VERIFY_INTERVAL_MS)
}
function stopVerifyLoop(): void {
  if (verifyTimer) clearInterval(verifyTimer)
  verifyTimer = null
}

watch(
  () => props.payment,
  (p) => {
    live.value = p
    if (p) {
      successShown.value = false
      settled = false
      closingIn.value = null
    }
  },
  { immediate: true },
)

const reference = computed(() => props.payment?.referenceId ?? null)
const status = computed(() => live.value?.status ?? 'pending')
const isPaid = computed(() => status.value === 'paid')
/** The bank app has scanned the QR but not confirmed the charge yet. */
const isScanned = computed(() => status.value === 'scanned')
const isTerminal = computed(() =>
  ['paid', 'expired', 'failed', 'refunded'].includes(status.value),
)

/** True once a QR image is actually available to render — drives the brief
 *  loading spinner and decides when the card is revealed. We never wait on
 *  the <img> load event (a display:none container can suppress it on mobile
 *  Safari, leaving a permanent spinner); the QR renders the moment the
 *  payment carries a data URL. */
const hasQr = computed(() =>
  Boolean(live.value?.qrCodeDataUrl || props.payment?.qrCodeDataUrl),
)

/** True when there's an external hosted checkout (ABA-style) — the card
 *  falls back to an "Open secure checkout" action instead of a QR. */
const hasCheckout = computed(() =>
  Boolean(live.value?.checkoutUrl || props.payment?.checkoutUrl),
)

/** The card is ready when we have a QR, a hosted checkout, or the state has
 *  already resolved — never wait on the image load event. */
const showContent = computed(
  () => hasQr.value || hasCheckout.value || successShown.value || isPaid.value || isTerminal.value,
)

// ---------------------------------------------------------------------------
// Countdown
// ---------------------------------------------------------------------------

const now = ref(Date.now())
let clock: ReturnType<typeof setInterval> | null = null

function startClock(): void {
  stopClock()
  now.value = Date.now()
  clock = setInterval(() => (now.value = Date.now()), 1000)
}
function stopClock(): void {
  if (clock) clearInterval(clock)
  clock = null
}

const countdown = computed(() => {
  if (!live.value?.expiresAt) return { total: 0, mins: '00', secs: '00', expired: false }
  const diff = Math.max(0, new Date(live.value.expiresAt).getTime() - now.value)
  const expired = diff <= 0 && !isPaid.value
  const total = Math.floor(diff / 1000)
  return {
    total,
    mins: String(Math.floor(total / 60)).padStart(2, '0'),
    secs: String(total % 60).padStart(2, '0'),
    expired,
  }
})
const countdownDanger = computed(
  () => countdown.value.total > 0 && countdown.value.total <= 60,
)

// ---------------------------------------------------------------------------
// Live verification (SSE + polling) — the "auto verify" brain
// ---------------------------------------------------------------------------

function celebrate(): void {
  void confetti({
    particleCount: 120,
    spread: 75,
    origin: { y: 0.6 },
    colors: ['#E41A2B', '#00E5FF', '#3B82F6', '#ffffff'],
  })
}

/** Guards the once-per-payment success path (SSE + poll can both fire).
 *  This is the VERIFIED path: the backend confirmed the charge with the
 *  provider, so firing `payment_success` here is backed by real state. */
function handlePaid(): void {
  if (settled || !props.payment) return
  settled = true
  successShown.value = true
  celebrate()
  toast.success(`${formatMoney(props.payment.amount)} added to your wallet`)
  event('payment_success', {
    order_type: props.payment.purpose,
    currency: props.payment.currency || 'USD',
    value: props.payment.amount,
    provider: props.payment.provider,
    payment_status: 'paid',
  })
  if (props.payment.purpose === 'topup') {
    event('wallet_topup_success', {
      currency: props.payment.currency || 'USD',
      value: props.payment.amount,
      provider: props.payment.provider,
    })
  }
  emit('paid', props.payment)
  startAutoClose()
}

function applySnapshot(snap: PaymentStatusResponse): void {
  live.value = snap.payment
  if (snap.payment.status === 'paid') {
    handlePaid()
  } else if (snap.payment.status === 'scanned') {
    // The bank app has the QR — race to confirm the charge NOW instead of
    // waiting for the next poll cycle.
    void refreshFromProvider()
  }
}

function applyEvent(event: PaymentLiveEvent): void {
  if (!live.value || event.referenceId !== reference.value) return
  live.value.status = event.status as Payment['status']
  if (event.approvedAt) live.value.approvedAt = event.approvedAt
  if (event.status === 'paid') {
    // Pull the confirmed snapshot (amount/approvedAt) from the backend.
    void paymentApi
      .verify(reference.value ?? '')
      .then(applySnapshot)
      .catch(() => handlePaid())
  } else if (event.status === 'scanned') {
    // Scan detected — confirm immediately (fast success, no waiting).
    void refreshFromProvider()
  }
}

const events = usePaymentEvents(() => reference.value, applySnapshot, applyEvent)

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen && props.payment) {
      events.start()
      startClock()
      startVerifyLoop()
      void refreshFromProvider()
    } else {
      events.stop()
      stopClock()
      stopVerifyLoop()
    }
  },
  // Immediate: a re-mount with the modal already open (e.g. after a Vite HMR
  // reload of this file) must still start SSE + polling + provider verify.
  { immediate: true },
)

watch(reference, (ref) => {
  if (props.open && ref) {
    events.start()
    startClock()
    startVerifyLoop()
    void refreshFromProvider()
  }
})

/** Re-verifies with the provider the moment the customer returns to this tab
 *  (e.g. after switching to their bank app to scan & pay) — success appears
 *  instantly instead of waiting for the next poll cycle. */
async function refreshFromProvider(): Promise<void> {
  if (isTerminal.value || !reference.value || verifying) return
  verifying = true
  try {
    const snap = await paymentApi.verify(reference.value)
    applySnapshot(snap)
  } catch {
    /* non-fatal — SSE/polling continue */
  } finally {
    verifying = false
  }
}

function handleVisibilityChange(): void {
  if (document.visibilityState === 'visible') void refreshFromProvider()
}

// ---------------------------------------------------------------------------
// Auto-close after a successful payment
// ---------------------------------------------------------------------------

let closeTimer: ReturnType<typeof setInterval> | null = null

const AUTO_CLOSE_AFTER_S = 4

function startAutoClose(): void {
  stopAutoClose()
  closingIn.value = AUTO_CLOSE_AFTER_S
  closeTimer = setInterval(() => {
    if (closingIn.value === null) return
    closingIn.value -= 1
    if (closingIn.value <= 0) {
      stopAutoClose()
      emit('close')
    }
  }, 1000)
}
function stopAutoClose(): void {
  if (closeTimer) clearInterval(closeTimer)
  closeTimer = null
  closingIn.value = null
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function openHostedCheckout(): void {
  const url = live.value?.checkoutUrl ?? props.payment?.checkoutUrl
  if (url) window.open(url, '_blank', 'noopener')
}

async function cancelPayment(): Promise<void> {
  if (!props.payment) return
  try {
    await paymentApi.cancel(props.payment.referenceId)
    toast.info('Payment cancelled')
  } catch {
    /* the payment may already be terminal — closing is still correct */
  } finally {
    events.stop()
    emit('close')
  }
}

const providerLabel = computed(() => {
  const provider = live.value?.provider ?? props.payment?.provider
  if (provider === 'abapayway') return 'ABA PayWay'
  return 'Bakong'
})

/** Live status copy — flips the moment the bank app scans the QR. */
const waitingCopy = computed(() =>
  isScanned.value ? 'Payment detected — confirming…' : 'Waiting for payment…',
)

onUnmounted(() => {
  events.stop()
  stopClock()
  stopAutoClose()
  stopVerifyLoop()
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) document.addEventListener('visibilitychange', handleVisibilityChange)
    else document.removeEventListener('visibilitychange', handleVisibilityChange)
  },
)
</script>

<template>
  <Teleport to="body">
    <Transition name="aba-checkout">
      <!-- ABA PayWay checkout shell: fixed dark-navy overlay + centered
           white content (391px, 12px radius) / mobile bottom sheet. -->
      <div v-if="open" class="aba-checkout-overlay">
        <div class="aba-checkout-shell">
          <div class="aba-checkout-content !bg-gray-50/50">
            <!-- Mobile drag handle -->
            <div class="aba-checkout-drag" />

            <!-- Close button — top right, like the PayWay popup -->
            <button
              class="aba-close-button"
              aria-label="Close"
              :disabled="successShown"
              @click="emit('close')"
            >
              <X class="h-4 w-4" />
            </button>

            <!-- ABA-style loading spinner while the payment/QR is fetched -->
            <div v-if="!showContent" class="aba-checkout-loading">
              <span class="aba-spinner" />
            </div>

            <!-- Content — rendered the moment the QR data URL exists (never
                 gated on the image load event, which display:none can
                 suppress on mobile) or the state has resolved. -->
            <div v-show="showContent" class="aba-checkout-body pt-4">
              
              <!-- ======================================================
                   Redesigned Authentic KHQR terminal card
                   ====================================================== -->
              <div
                v-if="!successShown && status !== 'expired' && status !== 'failed'"
                class="overflow-hidden rounded-[20px] bg-white border border-gray-100 shadow-[0_4px_24px_rgba(0,0,0,0.04)] w-full max-w-[320px] mx-auto font-sans"
              >
                <!-- Red header with bottom-right chamfer cut -->
                <div class="khqr-header h-[68px] flex items-center justify-center relative bg-[#E1232E]">
                  <span class="text-white font-bold text-[22px] tracking-widest">KHQR</span>
                </div>

                <!-- Merchant & Amount Info (Left Aligned) -->
                <div class="px-6 pt-5 pb-4 text-left">
                  <div class="text-gray-600 text-[15px] mb-0.5">DigitalSMM</div>
                  <div class="flex items-baseline gap-1.5">
                    <span class="text-[28px] font-extrabold text-gray-900 leading-none">
                      {{ formatMoney(live?.amount ?? props.payment?.amount ?? 0).replace('$', '') }}
                    </span>
                    <span class="text-[15px] font-bold text-gray-600">USD</span>
                  </div>
                </div>

                <!-- Dashed Separator -->
                <div class="mx-6 border-t-[1.5px] border-dashed border-gray-200"></div>

                <!-- QR Area -->
                <div class="flex flex-col items-center px-6 pb-5 pt-6">
                  <div
                    class="relative flex aspect-square w-[210px] items-center justify-center bg-white"
                  >
                    <img
                      v-if="hasQr"
                      :src="(live?.qrCodeDataUrl ?? props.payment?.qrCodeDataUrl) as string"
                      alt="KHQR"
                      class="h-full w-full object-contain"
                    />
                    <button
                      v-else-if="hasCheckout"
                      type="button"
                      class="flex h-full w-full flex-col items-center justify-center gap-2 rounded-xl bg-gray-50 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
                      @click="openHostedCheckout"
                    >
                      <ExternalLink class="h-6 w-6 text-gray-400" />
                      Open secure checkout
                    </button>
                    <Loader2 v-else class="h-8 w-8 animate-spin text-gray-300" />
                  </div>
                  
                  <!-- Footer Text -->
                  <div class="text-center pt-6 pb-2 text-[15px] font-bold text-[#2A303C]">
                    Scan to Pay with KHQR
                  </div>
                </div>

                <!-- Live status + countdown (Integrated seamlessly at the bottom) -->
                <div class="bg-gray-50/80 px-5 py-4 border-t border-gray-100 flex flex-col gap-2.5">
                  <div class="flex w-full items-center justify-between">
                    <div class="flex items-center gap-2">
                      <span class="relative flex h-2 w-2">
                        <span
                          class="live-ring absolute inline-flex h-full w-full rounded-full opacity-75"
                          :class="isScanned ? 'bg-amber-500' : 'bg-emerald-500'"
                        />
                        <span
                          class="relative inline-flex h-2 w-2 rounded-full"
                          :class="isScanned ? 'bg-amber-500' : 'bg-emerald-500'"
                        />
                      </span>
                      <span
                        class="text-xs font-medium"
                        :class="isScanned ? 'font-semibold text-amber-600' : 'text-gray-500'"
                      >
                        {{ waitingCopy }}
                      </span>
                    </div>
                    <div class="flex items-center gap-1" :class="countdownDanger ? 'text-rose-500' : 'text-gray-400'">
                      <Clock class="h-3.5 w-3.5" />
                      <span class="text-sm font-semibold tabular-nums tracking-tight">
                        {{ countdown.mins }}:{{ countdown.secs }}
                      </span>
                    </div>
                  </div>
                  <div class="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-gray-400">
                    <ShieldCheck class="h-3.5 w-3.5" />
                    Secured by {{ providerLabel }}
                  </div>
                </div>
              </div>

              <!-- Success state -->
              <div v-else-if="successShown || isPaid" class="py-8 text-center">
                <div
                  class="check-pop mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-[0_0_60px_-8px_rgba(52,211,153,0.8)]"
                >
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
                <h3 class="font-display mt-4 text-2xl font-bold text-gray-900">Payment Successful 🎉</h3>
                <p class="mt-2 text-gray-600">
                  <span class="font-semibold text-emerald-500">
                    {{ formatMoney(live?.amount ?? props.payment?.amount ?? 0) }}
                  </span>
                  has been added to your wallet.
                </p>
                <p
                  v-if="closingIn !== null && closingIn > 0"
                  class="mt-4 flex items-center justify-center gap-2 text-sm text-gray-500"
                >
                  <Loader2 class="h-4 w-4 animate-spin" />
                  Closing in {{ closingIn }}s…
                </p>
              </div>

              <!-- Expired / failed state -->
              <div v-else class="py-8 text-center">
                <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500">
                  <X class="h-8 w-8" />
                </div>
                <h3 class="font-display mt-4 text-xl font-bold text-gray-900">
                  {{ status === 'expired' ? 'QR Code Expired' : 'Payment Failed' }}
                </h3>
                <p class="mt-2 text-sm text-gray-500">
                  No money was charged. You can try again from your wallet.
                </p>
              </div>

              <!-- Cancel / close -->
              <div class="mt-5 flex justify-center">
                <BaseButton
                  v-if="!successShown && !isPaid && status !== 'expired' && status !== 'failed'"
                  variant="ghost"
                  size="sm"
                  class="text-gray-500 hover:text-gray-900"
                  @click="cancelPayment"
                >
                  Cancel transaction
                </BaseButton>
                <BaseButton
                  v-else-if="status === 'expired' || status === 'failed'"
                  variant="outline"
                  size="sm"
                  @click="emit('close')"
                >
                  <ExternalLink class="h-3.5 w-3.5" /> Close
                </BaseButton>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* =====================================================================
   ABA PayWay checkout shell — visual language lifted from the official
   payway.js SDK (dark navy overlay, centered white 391px card, loading
   spinner, close X, 0.5s fade, mobile bottom sheet).
   ===================================================================== */

.aba-checkout-overlay {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  overflow: auto;
  background: #081b3787;
  z-index: 99999;
  animation: aba-modal-in 0.5s;
}
@keyframes aba-modal-in {
  0% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}

.aba-checkout-shell {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.aba-checkout-content {
  position: relative;
  width: 400px;
  max-width: 100%;
  min-height: 264px;
  padding: 26px 22px 22px;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 20px 60px -12px rgba(0, 0, 0, 0.45);
}

/* Close X — top right, like the PayWay popup */
.aba-close-button {
  position: absolute;
  right: 18px;
  top: 18px;
  z-index: 20;
  display: flex;
  height: 28px;
  width: 28px;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  color: #6b7280;
  transition: background 0.15s ease, color 0.15s ease;
}
.aba-close-button:hover {
  background: #e5e7eb;
  color: #111827;
}

/* ABA-style loading spinner — teal ring like the PayWay loader */
.aba-checkout-loading {
  display: flex;
  min-height: 264px;
  align-items: center;
  justify-content: center;
}
.aba-spinner {
  width: 44px;
  height: 44px;
  border-radius: 9999px;
  border: 4px solid #dadbdf;
  border-top-color: #3aa6a5;
  animation: aba-spin 1.1s linear infinite;
}
@keyframes aba-spin {
  to {
    transform: rotate(360deg);
  }
}

/* Mobile drag handle (bottom-sheet affordance) */
.aba-checkout-drag {
  display: none;
}

/* Reveal transition for the content after the loader */
.aba-checkout-body {
  animation: aba-body-in 0.35s ease both;
}
@keyframes aba-body-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 
  Creates the folded/cut corner look on the bottom right of the red header 
*/
.khqr-header {
  clip-path: polygon(0 0, 100% 0, 100% calc(100% - 16px), calc(100% - 16px) 100%, 0 100%);
}

/* Mobile: bottom sheet that POPS UP from the bottom, rounded top corners,
   drag handle — the standard Cambodian mobile bank-app sheet. */
@media (max-width: 640px) {
  .aba-checkout-overlay {
    animation: none;
  }
  .aba-checkout-shell {
    align-items: flex-end;
    padding: 0;
  }
  .aba-checkout-content {
    width: 100%;
    border-radius: 23px 23px 0 0;
    min-height: auto;
    padding: 20px 18px 24px;
    animation: aba-sheet-up 0.35s cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  .aba-checkout-drag {
    display: block;
    width: 44px;
    height: 4px;
    margin: 0 auto 14px;
    border-radius: 2px;
    background: #dcdcdc;
  }
}
/* Bottom-sheet slide-up for phones */
@keyframes aba-sheet-up {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}

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
.check-pop {
  animation: check-pop 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) both;
}
@keyframes check-pop {
  0% {
    transform: scale(0.5);
    opacity: 0;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}
.checkmark {
  stroke-dasharray: 48;
  stroke-dashoffset: 48;
  animation: draw 0.5s ease-out 0.4s forwards;
}
@keyframes draw {
  to {
    stroke-dashoffset: 0;
  }
}
</style>