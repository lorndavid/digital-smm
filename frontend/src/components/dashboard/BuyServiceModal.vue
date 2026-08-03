<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, ArrowRight, Link2, QrCode } from '@lucide/vue'
import type { Service } from '@/types/models'
import { paymentApi } from '@/api/payment.api'
import { ApiRequestError } from '@/api/client'
import { formatMoney, formatUnitPrice } from '@/utils/format'
import { SERVICE_TYPE_LABEL } from '@/utils/constants'
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
// Pricing
// ---------------------------------------------------------------------------

const totalPrice = computed(() => {
  const service = props.service
  if (!service) return 0
  if (service.type === 'Package' || service.type === 'Custom Comments Package') {
    return service.pricePerUnit
  }
  if (service.type === 'Subscriptions') {
    const min = Number(params.min) || 0
    return Math.round(min * service.pricePerUnit * 100) / 100
  }
  return Math.round((quantity.value ?? 0) * service.pricePerUnit * 100) / 100
})

// ---------------------------------------------------------------------------
// Flow
// ---------------------------------------------------------------------------

function goToSummary(): void {
  error.value = ''
  const service = props.service
  if (!service) return

  if (linkRequired.value && !link.value.trim()) {
    error.value = 'Please enter the link to your page or post'
    return
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
  // KHQR providers charge a $0.01 minimum — real per-unit rates are tiny,
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
    <!-- STEP 1: details -->
    <div v-if="step === 'details'" class="space-y-4">
      <div class="glass rounded-2xl p-4">
        <p class="font-display text-sm font-semibold text-white">{{ service?.name }}</p>
        <p class="mt-0.5 text-xs text-white/45">
          {{ serviceTypeLabel }} · {{ formatUnitPrice(service?.pricePerUnit ?? 0) }} / unit
        </p>
      </div>

      <BaseInput
        v-if="linkRequired"
        v-model="link"
        label="Link to your page or post"
        placeholder="https://tiktok.com/@username"
        hint="Paste the exact URL you want to grow."
        :error="error && !link ? error : ''"
      />

      <BaseInput
        v-if="quantityRequired"
        :model-value="quantity"
        @update:model-value="quantity = $event === '' || $event === null ? null : Number($event)"
        label="Quantity"
        type="number"
        :min="service?.min"
        :max="service?.max"
        :placeholder="service ? `${service.min} – ${service.max}` : ''"
        hint="Pick a quantity within the allowed range."
        :error="error && !quantity ? error : ''"
      />

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
        <div class="flex items-center justify-between text-sm">
          <span class="text-white/50">Service</span>
          <span class="font-medium text-white">{{ service?.name }}</span>
        </div>
        <div v-if="link" class="flex items-center justify-between gap-3 text-sm">
          <span class="text-white/50">Link</span>
          <span class="inline-flex max-w-[60%] items-center gap-1 truncate text-white">
            <Link2 class="h-3.5 w-3.5 shrink-0 text-brand-300" /> {{ link }}
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
          <span class="text-white/50">Unit price</span>
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
