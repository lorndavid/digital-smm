<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Check, ExternalLink, RefreshCcw, X } from '@lucide/vue'
import { useAuthStore } from '@/stores/auth.store'
import BrandLogo from '@/components/layout/BrandLogo.vue'
import BaseButton from '@/components/ui/BaseButton.vue'

/**
 * Landing page for CutLuy hosted-checkout redirects.
 *
 * CutLuy sends the customer here after a terminal payment, appending:
 *   ?status=success|failed&payment_id=…&reference_id=…
 * Configure the URL in CutLuy Dashboard → Settings → Checkout redirects:
 *   Success: https://<your-frontend>/payment-result
 *   Failed:  https://<your-frontend>/payment-result
 */
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const status = computed(() => (route.query.status === 'success' ? 'success' : 'failed'))
const paymentId = computed(() => String(route.query.payment_id ?? ''))
const referenceId = computed(() => String(route.query.reference_id ?? ''))

const isSuccess = computed(() => status.value === 'success')

function primaryCta(): void {
  if (authStore.isSignedIn) {
    router.push('/dashboard/orders')
  } else {
    router.push({ name: 'sign-in', query: { redirect: '/dashboard/orders' } })
  }
}
</script>

<template>
  <div class="relative flex min-h-screen items-center justify-center overflow-hidden bg-surface px-4 py-10">
    <div class="bg-grid pointer-events-none absolute inset-0 opacity-40" />
    <div
      class="animate-gradient pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-gradient-to-r from-brand-600/40 via-brand-500/20 to-secondary-500/30 blur-[110px]"
    />

    <div class="relative w-full max-w-md text-center">
      <div class="flex justify-center">
        <BrandLogo />
      </div>

      <div
        class="check-pop mx-auto mt-10 flex h-24 w-24 items-center justify-center rounded-full"
        :class="
          isSuccess
            ? 'bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-[0_0_60px_-8px_rgba(52,211,153,0.8)]'
            : 'bg-gradient-to-br from-rose-400 to-rose-600 shadow-[0_0_60px_-8px_rgba(244,63,94,0.7)]'
        "
      >
        <svg v-if="isSuccess" viewBox="0 0 52 52" class="h-10 w-10">
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
        <X v-else class="h-10 w-10 text-ink" />
      </div>

      <h1 class="font-display mt-4 text-2xl font-bold text-ink">
        {{ isSuccess ? 'Thank you! 🎉' : 'Payment not completed' }}
      </h1>
      <p class="mx-auto mt-3 max-w-sm text-ink/55">
        {{
          isSuccess
            ? 'Your payment was received and your order will be processed automatically. Check your dashboard for live status.'
            : 'No money was charged. You can retry the same payment, or pick another service anytime.'
        }}
      </p>

      <div class="glass mx-auto mt-6 max-w-sm space-y-2 rounded-2xl p-5 text-left text-sm">
        <div v-if="referenceId" class="flex items-center justify-between">
          <span class="text-ink/45">Reference</span>
          <span class="font-mono text-xs text-ink/70">{{ referenceId }}</span>
        </div>
        <div v-if="paymentId" class="flex items-center justify-between">
          <span class="text-ink/45">Payment ID</span>
          <span class="max-w-[55%] truncate font-mono text-xs text-ink/70">{{ paymentId }}</span>
        </div>
        <div v-if="isSuccess" class="flex items-center justify-between">
          <span class="text-ink/45">Status</span>
          <span class="font-semibold text-emerald-300">Paid</span>
        </div>
      </div>

      <div class="mt-8 flex justify-center gap-3">
        <BaseButton variant="outline" @click="router.push('/')">
          <ArrowLeft class="h-4 w-4" /> Home
        </BaseButton>
        <BaseButton v-if="isSuccess" @click="primaryCta">
          <Check class="h-4 w-4" /> View my orders
        </BaseButton>
        <BaseButton v-else-if="referenceId" variant="secondary" @click="router.push(`/pay/${referenceId}`)">
          <RefreshCcw class="h-4 w-4" /> Retry payment
        </BaseButton>
        <BaseButton v-else @click="router.push('/dashboard/services')">
          <ExternalLink class="h-4 w-4" /> Explore services
        </BaseButton>
      </div>

      <p class="mt-8 text-xs text-ink/30">
        Powered by CutLuy · Bakong KHQR · Secure USD checkout
      </p>
    </div>
  </div>
</template>

<style scoped>
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
