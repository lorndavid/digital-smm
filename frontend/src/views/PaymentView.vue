<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import confetti from 'canvas-confetti'
import {
  ArrowLeft,
  Check,
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
import { formatMoney, formatNumber } from '@/utils/format'
import BrandLogo from '@/components/layout/BrandLogo.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseSkeleton from '@/components/ui/BaseSkeleton.vue'
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

const status = computed(() => payment.value?.status ?? 'pending')
const isPaid = computed(() => status.value === 'paid')
const isTerminal = computed(() => ['paid', 'expired', 'failed', 'refunded'].includes(status.value))
const isOrder = computed(() => payment.value?.purpose === 'order')

// ---------------------------------------------------------------------------
// Auto-close on expiry: when the QR expires unpaid, close the checkout
// automatically so the customer isn't left staring at a dead QR.
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
  if (snap.payment.status === 'paid') celebrate()
}

function applyEvent(event: PaymentLiveEvent): void {
  if (!payment.value) return
  payment.value.status = event.status as Payment['status']
  if (event.approvedAt) payment.value.approvedAt = event.approvedAt
  if (event.status === 'paid') {
    void paymentApi.status(reference.value).then(applySnapshot).catch(() => undefined)
    celebrate()
  }
}

const events = usePaymentEvents(() => reference.value, applySnapshot, applyEvent)

function celebrate(): void {
  void confetti({
    particleCount: 140,
    spread: 75,
    origin: { y: 0.7 },
    colors: ['#6C3BFF', '#00E5FF', '#3B82F6', '#ffffff'],
  })
  void confetti({ particleCount: 60, angle: 60, spread: 60, origin: { x: 0, y: 0.7 } })
  void confetti({ particleCount: 60, angle: 120, spread: 60, origin: { x: 1, y: 0.7 } })
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
    const snap = await paymentApi.status(reference.value)
    applySnapshot(snap)
    startClock()
    events.start()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load payment'
    loading.value = false
  }
}

watch(reference, () => {
  payment.value = null
  order.value = null
  void init()
})

function handleBeforeUnload(): void {
  events.stop()
}

onMounted(() => {
  void init()
  window.addEventListener('beforeunload', handleBeforeUnload)
})

onUnmounted(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
  stopCloseCountdown()
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
  try {
    await paymentApi.cancel(payment.value.referenceId)
    toast.info('Payment cancelled')
    router.push(isOrder.value ? '/dashboard/orders' : '/dashboard/wallet')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Could not cancel payment')
  } finally {
    actionBusy.value = false
  }
}

async function retryPayment(): Promise<void> {
  if (!order.value) return
  actionBusy.value = true
  try {
    const snap = await paymentApi.retry(order.value._id)
    // New payment → new reference → the watch() re-initialises this page.
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

/**
 * Cambodian banking apps. Each chip opens the branded CutLuy hosted checkout,
 * which on mobile deep-links into the chosen banking app with the KHQR amount
 * already embedded (the EMV payload carries the amount, so any bank app
 * scanner auto-fills it). Colors match each bank's brand.
 */
const banks = [
  { id: 'aba', short: 'ABA', name: 'ABA Bank', color: '#E4002B' },
  { id: 'bakong', short: 'B', name: 'Bakong', color: '#0E7C7B' },
  { id: 'acleda', short: 'A', name: 'ACLEDA', color: '#1B3F8F' },
  { id: 'wing', short: 'W', name: 'Wing', color: '#E30613' },
]

function serviceName(): string {
  if (!order.value) return ''
  return typeof order.value.service === 'object' ? order.value.service.name : 'Service'
}

// ---------------------------------------------------------------------------
// Stepper
// ---------------------------------------------------------------------------

const steps = [
  { key: 'pending', label: 'Pending', sub: 'Waiting for scan' },
  { key: 'scanned', label: 'Scanned', sub: 'Confirming in app' },
  { key: 'paid', label: 'Paid', sub: 'Payment confirmed' },
]
function stepState(key: string): 'done' | 'active' | 'todo' {
  const orderIdx = steps.findIndex((s) => s.key === status.value)
  const idx = steps.findIndex((s) => s.key === key)
  if (isPaid.value) return 'done'
  if (idx < orderIdx) return 'done'
  if (idx === orderIdx) return 'active'
  return 'todo'
}

const countdownDanger = computed(() => countdown.value.total > 0 && countdown.value.total <= 60)
</script>

<template>
  <div class="relative min-h-screen overflow-hidden bg-night">
    <!-- Ambient gradient blobs -->
    <div class="pointer-events-none absolute inset-0 overflow-hidden">
      <div class="absolute -top-40 left-1/4 h-[480px] w-[480px] rounded-full bg-brand-600/25 blur-[120px]" />
      <div class="absolute bottom-0 right-0 h-[420px] w-[420px] rounded-full bg-secondary-500/15 blur-[120px]" />
      <div class="bg-grid absolute inset-0 opacity-[0.07]" />
    </div>

    <div class="relative mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
      <!-- Header -->
      <header class="flex items-center justify-between">
        <RouterLink to="/dashboard" class="transition-opacity hover:opacity-80">
          <BrandLogo size="sm" />
        </RouterLink>
        <div class="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium text-white/60 backdrop-blur">
          <Lock class="h-3.5 w-3.5 text-emerald-400" />
          Secure checkout · Bakong KHQR
        </div>
      </header>

      <!-- Loading -->
      <div v-if="loading" class="mx-auto mt-16 w-full max-w-3xl space-y-4">
        <BaseSkeleton class="h-40 w-full rounded-3xl" />
        <div class="grid gap-4 sm:grid-cols-2">
          <BaseSkeleton class="h-64 w-full rounded-3xl" />
          <BaseSkeleton class="h-64 w-full rounded-3xl" />
        </div>
      </div>

      <!-- Load error -->
      <div v-else-if="error && !payment" class="mx-auto mt-24 max-w-md text-center">
        <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-300">
          <X class="h-8 w-8" />
        </div>
        <h2 class="font-display mt-5 text-xl font-bold text-white">Could not load this payment</h2>
        <p class="mt-2 text-sm text-white/50">{{ error }}</p>
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
          <svg viewBox="0 0 52 52" class="h-12 w-12">
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
        <h1 class="font-display mt-6 text-3xl font-bold text-white">
          {{ isOrder ? 'Order placed! 🎉' : 'Wallet credited! 🎉' }}
        </h1>
        <p class="mt-3 text-white/55">
          {{ isOrder ? `Order #${order?.orderNumber ?? ''} is now processing.` : 'Your balance has been topped up.' }}
          <span class="font-semibold text-emerald-300">{{ formatMoney(payment?.amount ?? 0) }}</span> paid.
        </p>

        <div v-if="isOrder && order" class="glass mx-auto mt-6 max-w-sm space-y-2 rounded-2xl p-5 text-left text-sm">
          <div class="flex items-center justify-between">
            <span class="text-white/45">Service</span>
            <span class="font-medium text-white">{{ serviceName() }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-white/45">Quantity</span>
            <span class="font-medium text-white">{{ formatNumber(order.quantity) }}</span>
          </div>
          <div class="flex items-center justify-between border-t border-white/10 pt-2">
            <span class="text-white/45">Reference</span>
            <span class="font-mono text-xs text-white/70">{{ payment?.referenceId }}</span>
          </div>
        </div>

        <div class="mt-8 flex justify-center gap-3">
          <BaseButton
            variant="outline"
            @click="router.push(isOrder ? '/dashboard/orders' : '/dashboard/wallet')"
          >
            <ArrowLeft class="h-4 w-4" /> Back to dashboard
          </BaseButton>
          <BaseButton variant="secondary" @click="router.push('/dashboard/services')">
            <Sparkles class="h-4 w-4" /> Grow more
          </BaseButton>
        </div>
      </div>

      <!-- Checkout -->
      <div v-else class="mx-auto mt-10 w-full max-w-4xl">
        <div class="grid items-start gap-6 lg:grid-cols-[1fr_400px]">
          <!-- Left: summary + status -->
          <div class="space-y-6">
            <div class="glass-strong rounded-3xl p-6 shadow-card sm:p-8">
              <p class="text-sm text-white/45">Order summary</p>
              <div v-if="isOrder && order" class="mt-4 space-y-3 text-sm">
                <div class="flex items-center justify-between gap-4">
                  <span class="text-white/50">Service</span>
                  <span class="max-w-[60%] truncate font-medium text-white">{{ serviceName() }}</span>
                </div>
                <div v-if="order.link" class="flex items-center justify-between gap-4">
                  <span class="text-white/50">Link</span>
                  <span class="max-w-[60%] truncate text-white/75">{{ order.link }}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-white/50">Quantity</span>
                  <span class="font-medium text-white">{{ formatNumber(order.quantity) }}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-white/50">Unit price</span>
                  <span class="text-white/75">{{ formatMoney(order.pricePerUnit) }}</span>
                </div>
              </div>
              <div v-else class="mt-4 flex items-center gap-3 text-sm text-white/70">
                <Wallet class="h-4 w-4 text-secondary-400" />
                Wallet top-up
              </div>
              <div class="mt-5 flex items-end justify-between border-t border-white/10 pt-5">
                <span class="text-sm text-white/50">Total due</span>
                <span class="font-display text-4xl font-bold text-white">
                  {{ formatMoney(payment?.amount ?? 0) }}
                </span>
              </div>
            </div>

            <!-- Live status -->
            <div class="glass rounded-3xl p-6 shadow-card">
              <div class="flex items-center justify-between">
                <p class="text-sm font-medium text-white">Payment status</p>
                <span
                  class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
                  :class="
                    status === 'paid'
                      ? 'bg-emerald-400/10 text-emerald-300'
                      : status === 'scanned'
                        ? 'bg-sky-400/10 text-sky-300'
                        : 'bg-amber-400/10 text-amber-300'
                  "
                >
                  <span
                    class="h-1.5 w-1.5 animate-pulse rounded-full"
                    :class="status === 'paid' ? 'bg-emerald-400' : status === 'scanned' ? 'bg-sky-400' : 'bg-amber-400'"
                  />
                  {{ status === 'paid' ? 'Paid' : status === 'scanned' ? 'Scanned — confirming' : 'Waiting for payment' }}
                </span>
              </div>

              <div class="mt-6 flex items-center">
                <template v-for="(step, i) in steps" :key="step.key">
                  <div class="flex flex-col items-center" :class="i < steps.length - 1 ? 'flex-1' : ''">
                    <div class="flex w-full items-center">
                      <div
                        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-500"
                        :class="
                          stepState(step.key) === 'done'
                            ? 'border-emerald-400 bg-emerald-400/20 text-emerald-300'
                            : stepState(step.key) === 'active'
                              ? 'border-brand-400 bg-brand-500/20 text-white shadow-glow'
                              : 'border-white/15 bg-white/5 text-white/30'
                        "
                      >
                        <Check v-if="stepState(step.key) === 'done'" class="h-4 w-4" />
                        <Loader2 v-else-if="stepState(step.key) === 'active'" class="h-4 w-4 animate-spin" />
                        <span v-else class="text-xs font-bold">{{ i + 1 }}</span>
                      </div>
                      <div
                        v-if="i < steps.length - 1"
                        class="mx-2 h-0.5 flex-1 rounded-full transition-colors duration-500"
                        :class="stepState(step.key) === 'done' ? 'bg-emerald-400/60' : 'bg-white/10'"
                      />
                    </div>
                    <p class="mt-2 text-xs font-medium" :class="stepState(step.key) === 'todo' ? 'text-white/30' : 'text-white/80'">
                      {{ step.label }}
                    </p>
                  </div>
                </template>
              </div>
            </div>

            <!-- Expired / failed -->
            <div
              v-if="status === 'expired' || status === 'failed'"
              class="rounded-3xl border border-rose-400/30 bg-rose-500/10 p-6"
            >
              <p class="font-display font-semibold text-white">
                {{ status === 'expired' ? 'This payment link has expired' : 'Payment failed' }}
              </p>
              <p class="mt-1 text-sm text-white/55">
                No money was charged. Generate a fresh QR to try again.
              </p>
              <p v-if="closingIn !== null" class="mt-2 text-xs text-white/40">
                Closing automatically in {{ closingIn }}s…
              </p>
              <BaseButton v-if="isOrder && order" class="mt-4" :loading="actionBusy" @click="retryPayment">
                <RefreshCcw class="h-4 w-4" /> Generate new QR
              </BaseButton>
              <BaseButton v-else class="mt-4" :loading="actionBusy" @click="router.push('/dashboard/wallet')">
                Back to wallet
              </BaseButton>
            </div>

            <!-- Cancel -->
            <button
              v-if="!isTerminal"
              class="text-sm text-white/35 underline-offset-4 transition-colors hover:text-white/70 hover:underline"
              :disabled="actionBusy"
              @click="cancelPayment"
            >
              Cancel payment
            </button>
          </div>

          <!-- Right: QR card -->
          <div class="glass-strong rounded-3xl p-6 shadow-glow sm:p-8">
            <div class="text-center">
              <!-- Coin header: KHQR + USD currency -->
              <div class="relative mx-auto mb-1 flex h-14 w-14 items-center justify-center">
                <div class="coin-glow absolute inset-0 rounded-full bg-gradient-to-br from-amber-300/60 via-yellow-400/40 to-amber-600/60 blur-lg" />
                <div class="coin relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-amber-200 via-yellow-400 to-amber-600 shadow-[0_8px_24px_-6px_rgba(251,191,36,0.7)] ring-4 ring-amber-300/30">
                  <span class="font-display text-xl font-black text-amber-950">$</span>
                </div>
                <span class="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-night-soft px-2 py-0.5 text-[9px] font-black tracking-widest text-amber-300 ring-1 ring-amber-400/40">
                  KHQR
                </span>
              </div>
              <div class="mt-2 flex items-center justify-center gap-2 text-sm text-white/50">
                <QrCode class="h-4 w-4 text-secondary-400" />
                Scan to pay · USD
              </div>

              <!-- Countdown -->
              <div
                class="mx-auto mt-4 flex w-fit items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors"
                :class="countdownDanger ? 'bg-rose-500/15 text-rose-300' : 'bg-white/5 text-white/70'"
              >
                <Clock class="h-4 w-4" />
                <span class="font-mono tabular-nums">{{ countdown.mins }}:{{ countdown.secs }}</span>
              </div>

              <!-- QR -->
              <div class="relative mx-auto mt-5 w-fit">
                <div class="rounded-3xl bg-white p-4 shadow-[0_20px_60px_-15px_rgba(108,59,255,0.55)]">
                  <img
                    v-if="payment?.qrCodeDataUrl"
                    :src="payment.qrCodeDataUrl"
                    alt="Bakong KHQR payment code"
                    class="h-52 w-52 sm:h-56 sm:w-56"
                  />
                  <div
                    v-else-if="payment?.checkoutUrl"
                    class="flex h-52 w-52 flex-col items-center justify-center gap-2 rounded-2xl bg-white/[0.03] px-6 text-center sm:h-56 sm:w-56"
                  >
                    <ExternalLink class="h-8 w-8 text-secondary-400" />
                    <p class="text-xs leading-relaxed text-white/60">
                      This payment uses a hosted checkout.
                      <span class="font-semibold text-white">Tap the button below</span> to pay securely.
                    </p>
                  </div>
                  <div v-else class="flex h-52 w-52 items-center justify-center sm:h-56 sm:w-56">
                    <Loader2 class="h-8 w-8 animate-spin text-brand-300" />
                  </div>
                </div>
                <div
                  v-if="status === 'scanned'"
                  class="absolute inset-0 flex items-center justify-center rounded-3xl bg-night/60 backdrop-blur-[2px]"
                >
                  <div class="text-center">
                    <Loader2 class="mx-auto h-8 w-8 animate-spin text-sky-300" />
                    <p class="mt-2 text-sm font-medium text-white">Payment scanned — confirm in your banking app</p>
                  </div>
                </div>
              </div>

              <p class="mt-4 font-display text-3xl font-bold text-white">
                {{ formatMoney(payment?.amount ?? 0) }}
              </p>
              <p class="mt-1 text-xs text-white/40">Bakong · ABA · ACLEDA · Wing</p>

              <!-- Banking app quick actions (mobile friendly — each opens the
                   branded CutLuy checkout which deep-links into the bank app) -->
              <div class="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <button
                  v-for="bank in banks"
                  :key="bank.id"
                  class="group flex flex-col items-center gap-1 rounded-xl border border-white/10 bg-white/5 py-2.5 transition-all hover:border-brand-400/50 hover:bg-white/10 active:scale-[0.97]"
                  :disabled="!payment?.checkoutUrl"
                  @click="openHostedCheckout"
                >
                  <span
                    class="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-black text-white shadow-inner"
                    :style="{ backgroundColor: bank.color }"
                  >
                    {{ bank.short }}
                  </span>
                  <span class="text-[10px] font-semibold text-white/70 group-hover:text-white">
                    {{ bank.name }}
                  </span>
                </button>
              </div>
              <p class="mt-2 flex items-center justify-center gap-1 text-[10px] text-white/35">
                <Smartphone class="h-3 w-3" />
                On your phone, tapping a bank opens its app — {{ formatMoney(payment?.amount ?? 0) }} is already in the QR
              </p>

              <!-- Copy buttons -->
              <div class="mt-5 grid grid-cols-2 gap-2">
                <button
                  class="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 py-2.5 text-xs font-semibold text-white/75 transition-all hover:border-brand-400/50 hover:text-white"
                  @click="copyText(formatMoney(payment?.amount ?? 0), 'Amount')"
                >
                  <Copy class="h-3.5 w-3.5" /> Copy amount
                </button>
                <button
                  class="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 py-2.5 text-xs font-semibold text-white/75 transition-all hover:border-brand-400/50 hover:text-white"
                  @click="copyText(payment?.referenceId ?? '', 'Reference')"
                >
                  <Copy class="h-3.5 w-3.5" /> Copy reference
                </button>
              </div>

              <!-- Hosted checkout -->
              <BaseButton
                v-if="payment?.checkoutUrl"
                class="mt-3 w-full"
                variant="secondary"
                size="lg"
                @click="openHostedCheckout"
              >
                <ExternalLink class="h-4 w-4" />
                {{ payment.method === 'ABA' ? 'Pay with ABA PayWay' : 'Open hosted checkout' }}
              </BaseButton>

              <p class="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-white/30">
                <ShieldCheck class="h-3.5 w-3.5 text-emerald-400/60" />
                Powered by {{ payment?.provider === 'cutluy' ? 'CutLuy' : payment?.provider === 'abapayway' ? 'ABA PayWay' : 'demo provider' }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.coin {
  animation: coin-in 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
}
.coin-glow {
  animation: coin-glow-pulse 2.5s ease-in-out infinite;
}
@keyframes coin-in {
  from {
    transform: scale(0.5) rotate(-18deg);
    opacity: 0;
  }
  to {
    transform: scale(1) rotate(0deg);
    opacity: 1;
  }
}
@keyframes coin-glow-pulse {
  0%,
  100% {
    opacity: 0.55;
    transform: scale(0.95);
  }
  50% {
    opacity: 0.9;
    transform: scale(1.1);
  }
}
.check-pop {
  animation: check-pop 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
}
@keyframes check-pop {
  0% {
    transform: scale(0.3);
    opacity: 0;
  }
  60% {
    transform: scale(1.1);
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}
.checkmark {
  stroke-dasharray: 48;
  stroke-dashoffset: 48;
  animation: draw 0.5s ease-out 0.35s forwards;
}
@keyframes draw {
  to {
    stroke-dashoffset: 0;
  }
}
</style>
