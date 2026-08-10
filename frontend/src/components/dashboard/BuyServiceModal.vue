<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  ArrowUpRight,
  CheckCircle2,
  Minus,
  Plus,
  Wallet,
  XCircle,
} from '@lucide/vue'
import type { Category, Service } from '@/types/models'
import { ordersApi } from '@/api/orders.api'
import { ApiRequestError } from '@/api/client'
import { useWalletStore } from '@/stores/wallet.store'
import { formatMoney, formatNumber, formatUnitPrice } from '@/utils/format'
import { SERVICE_TYPE_LABEL } from '@/utils/constants'
import { validateLink, PLATFORM_LABEL, type DetectedPlatform } from '@/utils/linkValidation'
import PlatformIcon from '@/components/ui/PlatformIcon.vue'
import { useToast } from '@/composables/useToast'
import { serviceFields, QUANTITY_TYPES, type FieldSpec } from '@/composables/useServiceFields'
import BaseModal from '@/components/ui/BaseModal.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import BaseTextarea from '@/components/ui/BaseTextarea.vue'

const props = defineProps<{ open: boolean; service: Service | null }>()
const emit = defineEmits<{ close: [] }>()

const router = useRouter()
const toast = useToast()
const walletStore = useWalletStore()

const link = ref('')
const quantity = ref<number | null>(null)
const params = reactive<Record<string, string>>({})
const error = ref('')
const submitting = ref(false)

watch(
  () => props.open,
  (open) => {
    if (open) {
      reset()
      // Keep the balance fresh so the insufficient-balance prompt is accurate.
      void walletStore.fetchWallet().catch(() => undefined)
    }
  },
)

function reset(): void {
  link.value = ''
  quantity.value = null
  for (const key of Object.keys(params)) delete params[key]
  error.value = ''
  submitting.value = false
}

// ---------------------------------------------------------------------------
// Type-aware fields
// ---------------------------------------------------------------------------

const fields = computed<FieldSpec[]>(() => serviceFields(props.service))

const visibleFields = computed(() =>
  fields.value.filter((f) => !f.showWhenTraffic || params.typeOfTraffic === f.showWhenTraffic),
)

const linkRequired = computed(() => !!props.service && props.service.type !== 'Subscriptions')
const quantityRequired = computed(
  () => !!props.service && QUANTITY_TYPES.includes(props.service.type),
)

// ---------------------------------------------------------------------------
// Link validation & platform detection
// ---------------------------------------------------------------------------

const linkCheck = computed(() => validateLink(link.value))
const detectedPlatform = computed<DetectedPlatform>(() => linkCheck.value.platform)

/** Pasted link is from a different platform than the service targets. */
const platformMismatch = computed(() => {
  const s = servicePlatform.value
  const d = detectedPlatform.value
  return s !== 'other' && d !== 'other' && s !== d
})

/** Platform of the service itself (from its category) — drives the header tile. */
const servicePlatform = computed<DetectedPlatform>(() => {
  const cat = props.service?.category
  if (cat && typeof cat === 'object' && 'platform' in cat) {
    const p = (cat as Category).platform
    if (p !== 'other') return p
  }
  return 'other'
})

/** Quantity stepper, clamped to the service's allowed range. */
function adjustQuantity(delta: number): void {
  const service = props.service
  const base = quantity.value ?? (service && service.min > 0 ? service.min : 1)
  const next = base + delta
  if (service) {
    if (service.min > 0 && next < service.min) return
    if (service.max > 0 && next > service.max) return
  }
  if (next >= 1) quantity.value = next
}

// ---------------------------------------------------------------------------
// Pricing & wallet
// ---------------------------------------------------------------------------

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * pricePerUnit is the provider's RATE PER 1,000 units (e.g. $0.84 per 1,000
 * viewers). Total = rate × qty / 1000. Package types have no quantity — the
 * rate IS the one-time price.
 */
const totalPrice = computed(() => {
  const service = props.service
  if (!service) return 0
  // Sold as exactly one unit (bundle/package) — the rate IS the price.
  if (service.min === 1 && service.max === 1) return service.pricePerUnit
  if (service.type === 'Package' || service.type === 'Custom Comments Package') {
    return service.pricePerUnit
  }
  if (service.type === 'Subscriptions') {
    const min = Number(params.min) || 0
    return round2((min * service.pricePerUnit) / 1000)
  }
  const q = quantity.value ?? 0
  if (q > 0) return round2((q * service.pricePerUnit) / 1000)
  return 0
})

const balance = computed(() => walletStore.wallet?.balance ?? 0)
const insufficient = computed(() => totalPrice.value > 0 && totalPrice.value > balance.value)
const balanceAfter = computed(() => round2(Math.max(0, balance.value - totalPrice.value)))
const shortfall = computed(() => round2(totalPrice.value - balance.value))

const serviceTypeLabel = computed(() =>
  props.service ? SERVICE_TYPE_LABEL[props.service.type] ?? props.service.type : '',
)

// ---------------------------------------------------------------------------
// Flow
// ---------------------------------------------------------------------------

function validate(): boolean {
  error.value = ''
  const service = props.service
  if (!service) {
    error.value = 'Please choose a service first'
    return false
  }
  if (linkRequired.value) {
    if (!link.value.trim()) {
      error.value = 'Please enter the link to your page or post'
      return false
    }
    if (!linkCheck.value.valid) {
      error.value = linkCheck.value.message
      return false
    }
  }
  if (quantityRequired.value) {
    const q = quantity.value
    if (!q || q <= 0) {
      error.value = 'Please enter a quantity'
      return false
    }
    if (service.min > 0 && q < service.min) {
      error.value = `Minimum quantity for this service is ${formatNumber(service.min)}`
      return false
    }
    if (service.max > 0 && q > service.max) {
      error.value = `Maximum quantity for this service is ${formatNumber(service.max)}`
      return false
    }
  }
  for (const field of visibleFields.value) {
    const value = params[field.key]?.trim()
    if (field.required && !value) {
      error.value = `${field.label} is required`
      return false
    }
    if (field.numeric && value && Number.isNaN(Number(value))) {
      error.value = `${field.label} must be a number`
      return false
    }
  }
  if (totalPrice.value > 0 && totalPrice.value < 0.01) {
    error.value = 'Order total is below the $0.01 USD minimum — increase the quantity'
    return false
  }
  return true
}

/** Places the order using the wallet balance (top-up prompt when short). */
async function placeOrder(): Promise<void> {
  if (!validate()) return
  if (insufficient.value) {
    error.value = 'Your wallet balance is not enough for this order — top up to continue.'
    return
  }
  const service = props.service
  if (!service) return
  submitting.value = true
  error.value = ''
  try {
    const order = await ordersApi.create({
      serviceId: service._id,
      link: link.value.trim() || undefined,
      quantity: quantity.value ?? undefined,
      params: { ...params },
    })
    emit('close')
    toast.success('Order placed — track it from your orders')
    await walletStore.refreshWallet().catch(() => undefined)
    await router.push(`/dashboard/orders/${order._id}`)
  } catch (err) {
    const message = err instanceof ApiRequestError ? err.message : 'Failed to place order'
    const isBalanceError =
      err instanceof ApiRequestError &&
      (message.toLowerCase().includes('insufficient') ||
        (typeof err.details === 'object' &&
          err.details !== null &&
          'balance' in err.details))
    error.value = isBalanceError
      ? 'Your wallet balance is not enough — top up to continue.'
      : message
    await walletStore.fetchWallet().catch(() => undefined)
  } finally {
    submitting.value = false
  }
}

function closeModal(): void {
  emit('close')
}
</script>

<template>
  <BaseModal :open="open" title="Buy service" max-width="max-w-lg" @close="closeModal">
    <div class="space-y-5">
      <!-- Selected service -->
      <div class="glass flex items-center gap-3 rounded-2xl p-4">
        <PlatformIcon :platform="servicePlatform" size="md" tile />
        <div class="min-w-0">
          <p class="font-display truncate text-sm font-semibold text-ink">{{ service?.name }}</p>
          <p class="mt-0.5 text-xs text-ink/45">
            {{ serviceTypeLabel }} · {{ formatUnitPrice(service?.pricePerUnit ?? 0) }} / 1,000
          </p>
        </div>
      </div>

      <!-- Link -->
      <BaseInput
        v-if="linkRequired"
        v-model="link"
        label="Link to your page or post"
        placeholder="https://www.tiktok.com/@username"
        :error="error && !link ? error : ''"
      />

      <div
        v-if="link"
        class="flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium"
        :class="
          linkCheck.valid
            ? linkCheck.platform !== 'other'
              ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
              : 'border-amber-400/30 bg-amber-400/10 text-amber-200'
            : 'border-rose-400/30 bg-rose-400/10 text-rose-200'
        "
      >
        <PlatformIcon
          v-if="linkCheck.valid && linkCheck.platform !== 'other'"
          :platform="linkCheck.platform"
          size="xs"
          tile
        />
        <CheckCircle2 v-else-if="linkCheck.valid" class="h-4 w-4 shrink-0" />
        <XCircle v-else class="h-4 w-4 shrink-0" />
        <span>{{ linkCheck.message }}</span>
      </div>

      <div
        v-if="platformMismatch"
        class="flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs font-medium text-amber-200"
      >
        <XCircle class="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          This service is for {{ PLATFORM_LABEL[servicePlatform] }}, but the link looks like
          {{ PLATFORM_LABEL[detectedPlatform] }} — make sure you paste the right URL.
        </span>
      </div>

      <!-- Quantity -->
      <div v-if="quantityRequired" class="space-y-1.5">
        <label class="text-xs font-medium text-ink/60">Quantity</label>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-ink/10 bg-ink/5 text-ink/70 transition-all hover:border-brand-400/50 hover:text-ink active:scale-95 disabled:opacity-30"
            :disabled="(quantity ?? (service?.min ?? 0)) <= (service?.min ?? 0)"
            aria-label="Decrease quantity"
            @click="adjustQuantity(-1)"
          >
            <Minus class="h-4 w-4" />
          </button>
          <BaseInput
            :model-value="quantity"
            class="flex-1"
            @update:model-value="quantity = $event === '' || $event === null ? null : Number($event)"
            type="number"
            :min="service?.min"
            :max="service?.max"
            :placeholder="service ? formatNumber(service.min) + ' – ' + formatNumber(service.max) : ''"
            :error="error && !quantity ? error : ''"
          />
          <button
            type="button"
            class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-ink/10 bg-ink/5 text-ink/70 transition-all hover:border-brand-400/50 hover:text-ink active:scale-95 disabled:opacity-30"
            :disabled="(quantity ?? 0) >= (service?.max ?? 0)"
            aria-label="Increase quantity"
            @click="adjustQuantity(1)"
          >
            <Plus class="h-4 w-4" />
          </button>
        </div>
      </div>

      <!-- Type-specific fields -->
      <div v-for="field in visibleFields" :key="field.key" class="space-y-1">
        <BaseInput
          v-if="field.type === 'input'"
          v-model="params[field.key]"
          :label="field.label"
          :placeholder="field.placeholder"
          type="text"
          :error="error && !params[field.key] ? error : ''"
        />
        <BaseTextarea
          v-else-if="field.type === 'textarea'"
          v-model="params[field.key]"
          :label="field.label"
          :placeholder="'One item per line'"
          rows="4"
          :error="error && !params[field.key] ? error : ''"
        />
        <BaseSelect
          v-else
          v-model="params[field.key]"
          :label="field.label"
          :options="field.options as Array<{ value: string; label: string }>"
          :error="error && !params[field.key] ? error : ''"
        />
      </div>

      <!-- Insufficient balance alert -->
      <div
        v-if="insufficient"
        class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3.5"
      >
        <div class="flex min-w-0 items-center gap-2.5">
          <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-400/15 text-amber-300">
            <Wallet class="h-4 w-4" />
          </div>
          <div class="min-w-0">
            <p class="text-sm font-semibold text-amber-200">Not enough balance</p>
            <p class="mt-0.5 text-xs text-amber-300">
              Top up <b>{{ formatMoney(shortfall) }}</b> more to buy this service.
            </p>
          </div>
        </div>
        <BaseButton variant="secondary" size="sm" @click="router.push('/dashboard/wallet')">
          Top up wallet <ArrowUpRight class="h-3.5 w-3.5" />
        </BaseButton>
      </div>

      <!-- Footer: charge + balance + submit -->
      <footer class="border-t border-ink/10 pt-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-sm text-ink/50">
              Charge
              <span v-if="totalPrice > 0" class="ml-1 text-xs text-ink/30">
                {{ formatUnitPrice(service?.pricePerUnit ?? 0) }}
                × {{ formatNumber(quantity ?? (service && service.min > 0 ? service.min : 1)) }} / 1,000
              </span>
            </p>
            <p class="mt-0.5 font-display text-2xl font-bold text-ink">
              {{ formatMoney(totalPrice) }}
            </p>
          </div>
          <div class="text-right text-sm">
            <p class="text-xs text-ink/40">Balance</p>
            <p class="font-semibold text-ink">{{ formatMoney(balance) }}</p>
            <p v-if="totalPrice > 0 && !insufficient" class="text-xs text-emerald-300">
              After: {{ formatMoney(balanceAfter) }}
            </p>
          </div>
        </div>

        <p v-if="error" class="mt-3 text-sm text-rose-300">{{ error }}</p>

        <BaseButton size="lg" block class="mt-4" :loading="submitting" @click="placeOrder">
          Place order <ArrowUpRight class="h-4 w-4" />
        </BaseButton>
      </footer>
    </div>
  </BaseModal>
</template>
