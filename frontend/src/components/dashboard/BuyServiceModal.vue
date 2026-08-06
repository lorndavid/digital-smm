<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Link2,
  Minus,
  Plus,
  QrCode,
  XCircle,
} from '@lucide/vue'
import type { Category, Service } from '@/types/models'
import { paymentApi } from '@/api/payment.api'
import { ApiRequestError } from '@/api/client'
import { formatMoney, formatUnitPrice } from '@/utils/format'
import { SERVICE_TYPE_LABEL } from '@/utils/constants'
import { validateLink, PLATFORM_LABEL, type DetectedPlatform } from '@/utils/linkValidation'
import PlatformIcon from '@/components/ui/PlatformIcon.vue'
import { useToast } from '@/composables/useToast'
import BaseModal from '@/components/ui/BaseModal.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import BaseTextarea from '@/components/ui/BaseTextarea.vue'

interface FieldSpec {
  key: string
  label: string
  type: 'input' | 'textarea' | 'select'
  required: boolean
  numeric?: boolean
  placeholder?: string
  options?: string[] | Array<{ value: string; label: string }>
  /** Web Traffic: only show for the matching type_of_traffic. */
  showWhenTraffic?: string
}

const props = defineProps<{ open: boolean; service: Service | null }>()
const emit = defineEmits<{ close: [] }>()

const router = useRouter()
const toast = useToast()

type Step = 'details' | 'summary'
const step = ref<Step>('details')
const link = ref('')
const quantity = ref<number | null>(null)
const params = reactive<Record<string, string>>({})
const error = ref('')
const submitting = ref(false)

watch(
  () => props.open,
  (open) => {
    if (open) reset()
  },
)

function reset(): void {
  step.value = 'details'
  link.value = ''
  quantity.value = null
  for (const key of Object.keys(params)) delete params[key]
  error.value = ''
  submitting.value = false
}

// ---------------------------------------------------------------------------
// Type-aware fields
// ---------------------------------------------------------------------------

const QUANTITY_TYPES = [
  'Default',
  'SEO',
  'Mentions',
  'Mentions User Followers',
  'Comment Likes',
  'Poll',
  'Invites from Groups',
  'Web Traffic',
]

const fields = computed<FieldSpec[]>(() => {
  const service = props.service
  if (!service) return []
  switch (service.type) {
    case 'Custom Comments':
    case 'Custom Comments Package':
      return [
        { key: 'comments', label: 'Comments (one per line)', type: 'textarea', required: true },
      ]
    case 'Comment Replies':
      return [
        { key: 'username', label: 'Username', type: 'input', required: true },
        { key: 'comments', label: 'Comments (one per line)', type: 'textarea', required: true },
      ]
    case 'Mentions':
      return [
        { key: 'usernames', label: 'Usernames (one per line)', type: 'textarea', required: true },
      ]
    case 'Mentions User Followers':
    case 'Comment Likes':
      return [{ key: 'username', label: 'Username', type: 'input', required: true }]
    case 'Poll':
      return [
        { key: 'answerNumber', label: 'Answer number', type: 'input', required: true, numeric: true },
      ]
    case 'SEO':
      return [
        { key: 'keywords', label: 'Keywords (one per line)', type: 'textarea', required: true },
      ]
    case 'Invites from Groups':
      return [
        { key: 'groups', label: 'Groups (one per line)', type: 'textarea', required: true },
      ]
    case 'Subscriptions':
      return [
        { key: 'username', label: 'Username', type: 'input', required: true },
        { key: 'min', label: 'Min quantity', type: 'input', required: true, numeric: true },
        { key: 'max', label: 'Max quantity', type: 'input', required: true, numeric: true },
        {
          key: 'delay',
          label: 'Delay (minutes)',
          type: 'select',
          required: true,
          options: ['0', '5', '10', '15', '20', '30', '40', '50', '60', '90', '120', '150', '180', '210', '240', '270', '300', '360', '420', '480', '540', '600'],
        },
      ]
    case 'Web Traffic':
      return [
        { key: 'country', label: 'Country (e.g. "US" or "United States")', type: 'input', required: true },
        {
          key: 'device',
          label: 'Device',
          type: 'select',
          required: true,
          options: [
            { value: '1', label: 'Desktop' },
            { value: '2', label: 'Mobile (Android)' },
            { value: '3', label: 'Mobile (iOS)' },
            { value: '4', label: 'Mixed (Mobile)' },
            { value: '5', label: 'Mixed (Mobile & Desktop)' },
          ],
        },
        {
          key: 'typeOfTraffic',
          label: 'Type of traffic',
          type: 'select',
          required: true,
          options: [
            { value: '1', label: 'Google Keyword' },
            { value: '2', label: 'Custom Referrer' },
            { value: '3', label: 'Blank Referrer' },
          ],
        },
        { key: 'googleKeyword', label: 'Google keyword', type: 'input', required: true, showWhenTraffic: '1' },
        { key: 'referringUrl', label: 'Referring URL', type: 'input', required: true, showWhenTraffic: '2' },
      ]
    default:
      return []
  }
})

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

const stepIndex = computed(() => (step.value === 'details' ? 0 : 1))

// ---------------------------------------------------------------------------
// Pricing
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
  return service.pricePerUnit
})

// ---------------------------------------------------------------------------
// Flow
// ---------------------------------------------------------------------------

function goToSummary(): void {
  error.value = ''
  const service = props.service
  if (!service) return

  if (linkRequired.value) {
    if (!link.value.trim()) {
      error.value = 'Please enter the link to your page or post'
      return
    }
    if (!linkCheck.value.valid) {
      error.value = linkCheck.value.message
      return
    }
  }
  if (quantityRequired.value) {
    const q = quantity.value
    if (!q || q <= 0) {
      error.value = 'Please enter a quantity'
      return
    }
    if (service.min > 0 && q < service.min) {
      error.value = `Minimum quantity for this service is ${service.min}`
      return
    }
    if (service.max > 0 && q > service.max) {
      error.value = `Maximum quantity for this service is ${service.max}`
      return
    }
  }
  for (const field of visibleFields.value) {
    const value = params[field.key]?.trim()
    if (field.required && !value) {
      error.value = `${field.label} is required`
      return
    }
    if (field.numeric && value && Number.isNaN(Number(value))) {
      error.value = `${field.label} must be a number`
      return
    }
  }
  step.value = 'summary'
}

/** Creates the payment (and local pending order) then opens the checkout page. */
async function continueToPayment(): Promise<void> {
  if (!props.service) return
  submitting.value = true
  error.value = ''
  // KHQR providers charge a $0.01 minimum — real per-1,000 rates are tiny,
  // so small quantities can fall below it. Fail fast with a clear message.
  if (totalPrice.value < 0.01) {
    error.value = 'Order total is below the $0.01 USD minimum — increase the quantity'
    submitting.value = false
    return
  }
  try {
    const { payment } = await paymentApi.create({
      purpose: 'order',
      serviceId: props.service._id,
      link: link.value.trim() || undefined,
      quantity: quantity.value ?? undefined,
      params: { ...params },
    })
    emit('close')
    toast.success('Payment ready — scan the KHQR to pay')
    await router.push(`/pay/${payment.referenceId}`)
  } catch (err) {
    error.value = err instanceof ApiRequestError ? err.message : 'Failed to create payment'
  } finally {
    submitting.value = false
  }
}

function closeModal(): void {
  emit('close')
}

const stepTitles: Record<Step, string> = {
  details: 'Buy service',
  summary: 'Order summary',
}

const serviceTypeLabel = computed(() =>
  props.service ? SERVICE_TYPE_LABEL[props.service.type] ?? props.service.type : '',
)
</script>

<template>
  <BaseModal :open="open" :title="stepTitles[step]" max-width="max-w-lg" @close="closeModal">
    <!-- Step indicator -->
    <div class="mb-4 flex items-center gap-2">
      <template v-for="(label, i) in ['Details', 'Summary', 'Payment']" :key="label">
        <template v-if="i > 0">
          <span
            class="h-px flex-1"
            :class="i <= stepIndex ? 'bg-gradient-to-r from-brand-500 to-secondary-400' : 'bg-white/10'"
          />
        </template>
        <span class="flex shrink-0 items-center gap-1.5">
          <span
            class="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold transition-all duration-300"
            :class="
              i < stepIndex
                ? 'bg-emerald-400/20 text-emerald-300'
                : i === stepIndex
                  ? 'bg-gradient-to-br from-brand-500 to-secondary-500 text-white shadow-glow'
                  : 'bg-white/10 text-white/40'
            "
          >
            <Check v-if="i < stepIndex" class="h-3.5 w-3.5" />
            <template v-else>{{ i + 1 }}</template>
          </span>
          <span class="text-xs font-medium" :class="i === stepIndex ? 'text-white' : 'text-white/40'">
            {{ label }}
          </span>
        </span>
      </template>
    </div>

    <!-- STEP 1: details -->
    <div v-if="step === 'details'" class="space-y-4">
      <div class="glass flex items-center gap-3 rounded-2xl p-4">
        <PlatformIcon :platform="servicePlatform" size="md" tile />
        <div class="min-w-0">
          <p class="font-display truncate text-sm font-semibold text-white">{{ service?.name }}</p>
          <p class="mt-0.5 text-xs text-white/45">
            {{ serviceTypeLabel }} · {{ formatUnitPrice(service?.pricePerUnit ?? 0) }} / 1,000
          </p>
        </div>
      </div>

      <BaseInput
        v-if="linkRequired"
        v-model="link"
        label="Link to your page or post"
        placeholder="https://www.tiktok.com/@username"
        hint="Paste the exact URL you want to grow — we detect the platform automatically."
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

      <div v-if="quantityRequired" class="space-y-1.5">
        <label class="text-xs font-medium text-white/60">Quantity</label>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/70 transition-all hover:border-brand-400/50 hover:text-white active:scale-95 disabled:opacity-30"
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
            :placeholder="service ? `${service.min} – ${service.max}` : ''"
            :error="error && !quantity ? error : ''"
          />
          <button
            type="button"
            class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/70 transition-all hover:border-brand-400/50 hover:text-white active:scale-95 disabled:opacity-30"
            :disabled="(quantity ?? 0) >= (service?.max ?? 0)"
            aria-label="Increase quantity"
            @click="adjustQuantity(1)"
          >
            <Plus class="h-4 w-4" />
          </button>
        </div>
        <p class="text-xs text-white/40">
          Allowed range: <span class="text-white/70">{{ service?.min }} – {{ service?.max }}</span> units
        </p>
      </div>

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

      <p v-if="error && (link || quantity || visibleFields.some((f) => params[f.key]))" class="text-sm text-rose-300">
        {{ error }}
      </p>

      <div class="flex items-center justify-between pt-2">
        <p class="text-sm text-white/50">
          Total: <span class="font-semibold text-white">{{ formatMoney(totalPrice) }}</span>
        </p>
        <BaseButton @click="goToSummary">Continue <ArrowRight class="h-4 w-4" /></BaseButton>
      </div>
    </div>

    <!-- STEP 2: summary -->
    <div v-else class="space-y-4">
      <div class="space-y-3 rounded-2xl bg-white/[0.03] p-5">
        <div class="flex items-center justify-between gap-3 text-sm">
          <span class="shrink-0 text-white/50">Service</span>
          <span class="flex min-w-0 items-center gap-2 font-medium text-white">
            <PlatformIcon v-if="servicePlatform !== 'other'" :platform="servicePlatform" size="xs" tile />
            <span class="truncate">{{ service?.name }}</span>
          </span>
        </div>
        <div v-if="link" class="flex items-center justify-between gap-3 text-sm">
          <span class="shrink-0 text-white/50">Link</span>
          <span class="inline-flex min-w-0 max-w-[60%] items-center gap-1 truncate text-white">
            <PlatformIcon v-if="detectedPlatform !== 'other'" :platform="detectedPlatform" size="xs" tile />
            <Link2 v-else class="h-3.5 w-3.5 shrink-0 text-brand-300" />
            <span class="truncate">{{ link }}</span>
          </span>
        </div>
        <div v-if="quantity" class="flex items-center justify-between text-sm">
          <span class="text-white/50">Quantity</span>
          <span class="font-medium text-white">{{ quantity.toLocaleString() }}</span>
        </div>
        <div v-if="params && Object.keys(params).length" class="flex items-center justify-between text-sm">
          <span class="text-white/50">Options</span>
          <span class="max-w-[60%] truncate text-white/80">{{ Object.values(params).filter(Boolean).join(' · ') }}</span>
        </div>
        <div class="flex items-center justify-between text-sm">
          <span class="text-white/50">Rate / 1,000</span>
          <span class="text-white">{{ formatUnitPrice(service?.pricePerUnit ?? 0) }}</span>
        </div>
        <div class="flex items-center justify-between border-t border-white/10 pt-3">
          <span class="text-sm font-medium text-white">Total</span>
          <span class="font-display text-xl font-bold text-white">{{ formatMoney(totalPrice) }}</span>
        </div>
      </div>

      <p class="flex items-center gap-2 text-xs text-white/40">
        <QrCode class="h-4 w-4 text-secondary-400" />
        You'll pay securely with Bakong KHQR. Your order is reserved until the payment settles.
      </p>

      <p v-if="error" class="text-sm text-rose-300">{{ error }}</p>

      <div class="flex items-center justify-between pt-2">
        <BaseButton variant="ghost" @click="step = 'details'">
          <ArrowLeft class="h-4 w-4" /> Back
        </BaseButton>
        <BaseButton :loading="submitting" @click="continueToPayment">
          Continue to payment <ArrowRight class="h-4 w-4" />
        </BaseButton>
      </div>
    </div>
  </BaseModal>
</template>
