<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Minus,
  Plus,
  RotateCcw,
  Search,
  Wallet,
  XCircle,
} from '@lucide/vue'
import { watchDebounced } from '@vueuse/core'
import { servicesApi } from '@/api/services.api'
import { ordersApi } from '@/api/orders.api'
import { ApiRequestError } from '@/api/client'
import { useServicesStore } from '@/stores/services.store'
import { useWalletStore } from '@/stores/wallet.store'
import { useToast } from '@/composables/useToast'
import {
  serviceFields,
  QUANTITY_TYPES,
  type FieldSpec,
} from '@/composables/useServiceFields'
import {
  detectPlatform,
  validateLink,
  PLATFORM_LABEL,
  type DetectedPlatform,
} from '@/utils/linkValidation'
import { formatMoney, formatNumber, formatUnitPrice } from '@/utils/format'
import { SERVICE_TYPE_LABEL, PLATFORM_META } from '@/utils/constants'
import PlatformIcon from '@/components/ui/PlatformIcon.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import BaseTextarea from '@/components/ui/BaseTextarea.vue'
import BaseSkeleton from '@/components/ui/BaseSkeleton.vue'
import type { Category, Platform, Service } from '@/types/models'

const store = useServicesStore()
const walletStore = useWalletStore()
const route = useRoute()
const router = useRouter()
const toast = useToast()

// ---------------------------------------------------------------------------
// Catalogue browsing (server-backed search + category filter)
// ---------------------------------------------------------------------------

/** Services currently loaded — driven by the search box + category dropdown. */
const services = ref<Service[]>([])
const loading = ref(false)
const loadError = ref('')
const search = ref('')
const categoryId = ref('')

/** Search text inside the service combobox trigger (client-side, instant). */
const trigger = ref('')
const panelOpen = ref(false)
/** Index of the keyboard-highlighted row in the service dropdown (-1 = none). */
const panelIndex = ref(-1)
/** Scrollable results container inside the service dropdown. */
const panelListEl = ref<HTMLElement | null>(null)
/** Autocomplete dropdown under the main search box. */
const searchOpen = ref(false)
/** True while a freshly-typed query is still debouncing (no results yet). */
const searchPending = ref(false)
let searchTimer: ReturnType<typeof setTimeout> | null = null
/** Index of the keyboard-highlighted row in the search dropdown (-1 = none). */
const highlightedIndex = ref(-1)
/** Scrollable results container inside the search dropdown. */
const searchListEl = ref<HTMLElement | null>(null)

const selected = ref<Service | null>(null)

/** Active platform chip ('facebook', 'tiktok', … — '' = all platforms). */
const platform = ref('')

const categoryOptions = computed(() => [
  { value: '', label: 'All categories' },
  ...store.categories.map((c) => ({ value: c._id, label: c.name })),
])

/**
 * Platform chips shown in the header — one per platform that actually has
 * categories in the catalogue (curated, so chips never point at an empty
 * platform). Ordered like a real SMM panel: Facebook, TikTok, … The generic
 * "other" bucket is omitted — it has no meaningful icon/label to show.
 */
const platformChips = computed(() => {
  const present = new Set(store.categories.map((c) => c.platform))
  const order: Platform[] = ['facebook', 'tiktok', 'instagram', 'youtube', 'telegram']
  return order.filter((p) => p !== 'other' && present.has(p))
})

/** Label for a platform chip (falls back to the raw key). */
function platformLabel(p: string): string {
  return PLATFORM_META[p as Platform]?.label ?? p
}

async function loadServices(): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    // A typed query searches the WHOLE catalogue — the category/platform
    // filters only narrow when the user is browsing without a search text.
    const query = search.value.trim()
    const result = await servicesApi.list({
      search: query || undefined,
      category: query ? undefined : categoryId.value || undefined,
      platform: query ? undefined : platform.value || undefined,
      limit: 1000,
    })
    services.value = result.items
  } catch (err) {
    loadError.value = err instanceof ApiRequestError ? err.message : 'Failed to load services'
  } finally {
    loading.value = false
  }
}

watchDebounced([search], () => void loadServices(), { debounce: 350 })

/**
 * A browse-filter switch is a fresh start: drop any active search, deselect
 * the service and clear the order form so the user picks a service for the
 * new category/platform. (Opening the dropdown afterwards still reveals the
 * whole catalogue — changing their mind stays one click away.)
 */
function resetOrderFlow(): void {
  search.value = ''
  clearOrder()
  selected.value = null
  trigger.value = ''
  panelServices.value = []
  closeSearch()
}

function changeCategory(): void {
  resetOrderFlow()
  void loadServices()
}

/** Clicking a platform chip shows only that platform's services (server-side).
 *  Like a category switch, it resets the order flow for a fresh start. */
function selectPlatform(p: string): void {
  platform.value = platform.value === p ? '' : p
  categoryId.value = ''
  resetOrderFlow()
  void loadServices()
}

/** Server results for the trigger's typed query (whole catalogue, debounced). */
const panelServices = ref<Service[]>([])
let panelSearchTimer: ReturnType<typeof setTimeout> | null = null

/** Whole catalogue (no category/platform/search filters) — the fallback list
 *  shown when the combobox is opened, so changing the service is never
 *  trapped inside the current category's filtered list. */
const allServices = ref<Service[]>([])
let allServicesLoaded = false

async function loadAllServices(): Promise<void> {
  if (allServicesLoaded) return
  try {
    const res = await servicesApi.list({ limit: 1000 })
    allServices.value = res.items
    allServicesLoaded = true
  } catch {
    /* keep whatever we have — the filtered list still works */
  }
}

interface PanelGroup {
  label: string
  items: Service[]
}

/**
 * Rows shown in the service dropdown, sectioned like a real SMM panel:
 *  - While typing: one flat list (whole-catalogue server search + instant
 *    client filter).
 *  - Opened with no query: the currently filtered services first (labelled
 *    by category or platform — the "auto load" of the selected category),
 *    then ALL services from every other category under "All services" — so
 *    opening the dropdown to change the service always reveals the whole
 *    catalogue.
 */
const panelGroups = computed<PanelGroup[]>(() => {
  const q = trigger.value.trim().toLowerCase()

  // Typing → flat results (server search over the whole catalogue).
  if (q) {
    const source =
      q.length >= 2 && panelServices.value.length > 0
        ? panelServices.value
        : services.value
    const items = source.filter((s) => s.name.toLowerCase().includes(q))
    return [{ label: '', items }]
  }

  const preferred = services.value
  const preferredIds = new Set(preferred.map((s) => s._id))
  const rest = allServices.value.filter((s) => !preferredIds.has(s._id))

  const preferredLabel = categoryId.value
    ? (store.categories.find((c) => c._id === categoryId.value)?.name ?? 'Selected category')
    : platform.value
      ? platformLabel(platform.value)
      : 'All services'

  const groups: PanelGroup[] = []
  if (preferred.length) groups.push({ label: preferredLabel, items: preferred })
  if (rest.length) groups.push({ label: 'All services', items: rest })

  // The selected service is always visible at the very top of the list.
  if (selected.value && !groups.some((g) => g.items.some((s) => s._id === selected.value?._id))) {
    groups.unshift({ label: 'Selected', items: [selected.value] })
  }
  return groups
})

/** Flat projection of the dropdown rows — drives keyboard navigation. */
const dropdownServices = computed<Service[]>(() => panelGroups.value.flatMap((g) => g.items))

/** Row id → flat index, so the keyboard highlight works across sections. */
const panelIndexById = computed(() => new Map(dropdownServices.value.map((s, i) => [s._id, i])))

/** Debounced whole-catalogue search backing the Service combobox. */
function searchPanelServices(q: string): void {
  if (panelSearchTimer) clearTimeout(panelSearchTimer)
  if (q.trim().length < 2) {
    panelServices.value = []
    return
  }
  panelSearchTimer = setTimeout(async () => {
    try {
      // Respect the active platform chip so a filtered view never leaks
      // services from other platforms into the combobox.
      const res = await servicesApi.list({
        search: q.trim(),
        platform: platform.value || undefined,
        limit: 500,
      })
      // Only apply if the query hasn't changed while the request was in flight.
      if (trigger.value.trim() === q.trim()) panelServices.value = res.items
    } catch {
      // Keep whatever we have — the client-side filter still shows matches.
    }
  }, 350)
}

function categoryName(service: Service): string {
  const cat = service.category
  if (cat && typeof cat === 'object' && 'name' in cat) return cat.name
  return ''
}

/** Services listed under the search box while the user types (instant). */
const searchDropdownServices = computed<Service[]>(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return []
  return services.value.filter((s) => s.name.toLowerCase().includes(q))
})

/**
 * Category id of a service, so picking it can auto-set the Category dropdown.
 * Only returns ids that actually exist in the dropdown options (the curated
 * active list), so the select never lands on an invisible/blank value.
 */
function serviceCategoryId(service: Service): string {
  const cat = service.category
  const id =
    cat && typeof cat === 'object' && cat._id ? cat._id : typeof cat === 'string' ? cat : ''
  return id && store.categories.some((c) => c._id === id) ? id : ''
}

/** Fired as the user types — keeps the search GLOBAL and hides "no results" while debouncing. */
function onSearchInput(): void {
  // A fresh query searches the whole catalogue: drop any auto-set or manual
  // category so results are never silently scoped to one category.
  if (selected.value && search.value !== selected.value.name) {
    categoryId.value = ''
  }
  highlightedIndex.value = -1
  searchPending.value = true
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    searchPending.value = false
  }, 450)
}

/** Closes the search dropdown and clears its keyboard highlight. */
function closeSearch(): void {
  searchOpen.value = false
  highlightedIndex.value = -1
}

/** Arrow up/down + Enter navigation for the search results dropdown. */
function onSearchKeydown(event: KeyboardEvent): void {
  const list = searchDropdownServices.value
  if (list.length === 0) return
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    if (!searchOpen.value) searchOpen.value = true
    highlightedIndex.value =
      event.key === 'ArrowDown'
        ? (highlightedIndex.value + 1) % list.length
        : highlightedIndex.value < 0
          ? list.length - 1
          : (highlightedIndex.value - 1 + list.length) % list.length
  } else if (event.key === 'Enter') {
    const item = list[highlightedIndex.value]
    if (item) {
      event.preventDefault()
      selectServiceFromSearch(item)
    }
  }
}

// Keep the highlighted row visible while navigating with the arrow keys.
// Rows are the only <button> elements inside the list container, so their
// DOM order always matches searchDropdownServices.
watch(
  highlightedIndex,
  (index) => {
    if (index < 0) return
    searchListEl.value?.querySelectorAll('button')[index]?.scrollIntoView({ block: 'nearest' })
  },
  { flush: 'post' },
)

/** Applies a chosen service to the order form and syncs the Category dropdown. */
function setService(service: Service): void {
  selected.value = service
  categoryId.value = serviceCategoryId(service)
  clearOrder()
}

function selectService(service: Service): void {
  setService(service)
  panelOpen.value = false
  panelIndex.value = -1
  trigger.value = service.name
  panelServices.value = []
}

/** Picked from the search autocomplete — fills the box and auto-sets the category. */
function selectServiceFromSearch(service: Service): void {
  setService(service)
  search.value = service.name
  trigger.value = service.name
  panelServices.value = []
  closeSearch()
  panelOpen.value = false
  panelIndex.value = -1
}

/** Opens the service dropdown (trigger's focus event). */
function openServicePanel(): void {
  panelOpen.value = true
  panelIndex.value = -1
  closeSearch()
  void loadAllServices()
}

/** Closes the dropdown, restoring the selected service's name in the trigger. */
function closePanel(): void {
  panelOpen.value = false
  panelIndex.value = -1
  panelServices.value = []
  trigger.value = selected.value?.name ?? ''
}

/** Typing in the trigger filters instantly and searches the whole catalogue. */
function onPanelInput(): void {
  panelOpen.value = true
  panelIndex.value = -1
  searchPanelServices(trigger.value)
}

/** Arrow up/down + Enter navigation inside the service dropdown. */
function onPanelKeydown(event: KeyboardEvent): void {
  const list = dropdownServices.value
  if (list.length === 0) return
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    panelOpen.value = true
    panelIndex.value =
      event.key === 'ArrowDown'
        ? (panelIndex.value + 1) % list.length
        : panelIndex.value < 0
          ? list.length - 1
          : (panelIndex.value - 1 + list.length) % list.length
  } else if (event.key === 'Enter') {
    const item = list[panelIndex.value]
    if (item) {
      event.preventDefault()
      selectService(item)
    }
  }
}

// Keep the highlighted service row visible while navigating with arrow keys.
watch(
  panelIndex,
  (index) => {
    if (index < 0) return
    panelListEl.value?.querySelectorAll('button')[index]?.scrollIntoView({ block: 'nearest' })
  },
  { flush: 'post' },
)

function clearOrder(): void {
  link.value = ''
  quantity.value = null
  for (const key of Object.keys(params)) delete params[key]
  error.value = ''
}

// ---------------------------------------------------------------------------
// Order form
// ---------------------------------------------------------------------------

const link = ref('')
const quantity = ref<number | null>(null)
const params = reactive<Record<string, string>>({})
const error = ref('')
const submitting = ref(false)

const fields = computed<FieldSpec[]>(() => serviceFields(selected.value))
const visibleFields = computed(() =>
  fields.value.filter((f) => !f.showWhenTraffic || params.typeOfTraffic === f.showWhenTraffic),
)
const linkRequired = computed(
  () => !!selected.value && selected.value.type !== 'Subscriptions',
)
const quantityRequired = computed(
  () => !!selected.value && QUANTITY_TYPES.includes(selected.value.type),
)

const serviceTypeLabel = computed(() =>
  selected.value ? SERVICE_TYPE_LABEL[selected.value.type] ?? selected.value.type : '',
)

// Link validation & platform detection --------------------------------------

const linkCheck = computed(() => validateLink(link.value))
const detectedPlatform = computed<DetectedPlatform>(() => linkCheck.value.platform)

/** Platform of the selected service (from its category) — drives the tile. */
const servicePlatform = computed<DetectedPlatform>(() => {
  const cat = selected.value?.category
  if (cat && typeof cat === 'object' && 'platform' in cat) {
    const p = (cat as Category).platform
    if (p !== 'other') return p
  }
  return 'other'
})

/** Pasted link is from a different platform than the service targets. */
const platformMismatch = computed(() => {
  const s = servicePlatform.value
  const d = detectedPlatform.value
  return s !== 'other' && d !== 'other' && s !== d
})

// Pricing -------------------------------------------------------------------

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * pricePerUnit is the provider's RATE PER 1,000 units (e.g. $0.84 per 1,000
 * viewers). Total = rate × qty / 1000. Package types have no quantity — the
 * rate IS the one-time price. Subscriptions price by their min tier.
 */
const totalPrice = computed(() => {
  const s = selected.value
  if (!s) return 0
  if (s.min === 1 && s.max === 1) return s.pricePerUnit
  if (s.type === 'Package' || s.type === 'Custom Comments Package') return s.pricePerUnit
  if (s.type === 'Subscriptions') {
    const min = Number(params.min) || 0
    return round2((min * s.pricePerUnit) / 1000)
  }
  const q = quantity.value ?? 0
  if (q > 0) return round2((q * s.pricePerUnit) / 1000)
  return 0
})

// Wallet balance ------------------------------------------------------------

const balance = computed(() => walletStore.wallet?.balance ?? 0)
/** Live flag: the current charge exceeds the available balance. */
const insufficient = computed(() => totalPrice.value > 0 && totalPrice.value > balance.value)
const balanceAfter = computed(() => round2(Math.max(0, balance.value - totalPrice.value)))
const shortfall = computed(() => round2(totalPrice.value - balance.value))

/** Quantity stepper, clamped to the service's allowed range. */
function adjustQuantity(delta: number): void {
  const s = selected.value
  const base = quantity.value ?? (s && s.min > 0 ? s.min : 1)
  const next = base + delta
  if (s) {
    if (s.min > 0 && next < s.min) return
    if (s.max > 0 && next > s.max) return
  }
  if (next >= 1) quantity.value = next
}

function validate(): boolean {
  error.value = ''
  const s = selected.value
  if (!s) {
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
    if (s.min > 0 && q < s.min) {
      error.value = `Minimum quantity for this service is ${formatNumber(s.min)}`
      return false
    }
    if (s.max > 0 && q > s.max) {
      error.value = `Maximum quantity for this service is ${formatNumber(s.max)}`
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

/** Places the order using the wallet balance (fails with a top-up prompt when short). */
async function submit(): Promise<void> {
  if (!validate()) return
  if (insufficient.value) {
    error.value = 'Your wallet balance is not enough for this order — top up to continue.'
    return
  }
  const s = selected.value
  if (!s) return
  submitting.value = true
  error.value = ''
  try {
    const order = await ordersApi.create({
      serviceId: s._id,
      link: link.value.trim() || undefined,
      quantity: quantity.value ?? undefined,
      params: { ...params },
    })
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
    // Balance may have changed (another tab, admin adjustment) — re-read it.
    await walletStore.fetchWallet().catch(() => undefined)
  } finally {
    submitting.value = false
  }
}

// ---------------------------------------------------------------------------
// Prefill from an "Order again" link (route query set by the order detail page)
// ---------------------------------------------------------------------------

/**
 * Reads ?serviceId&link&quantity&params from the route and fills the whole
 * order form (service selected, category auto-set, fields populated), then
 * scrolls the pre-filled form into view.
 */
async function applyPrefill(): Promise<void> {
  const q = route.query
  const serviceId = typeof q.serviceId === 'string' ? q.serviceId : ''
  if (!serviceId) return

  // Resolve the service from the loaded catalogue; fall back to a server
  // search by name (covers services beyond the currently loaded page).
  let service = services.value.find((s) => s._id === serviceId) ?? null
  if (!service) {
    try {
      const res = await servicesApi.list({
        search: typeof q.serviceName === 'string' ? q.serviceName : serviceId,
        limit: 20,
      })
      service = res.items.find((s) => s._id === serviceId) ?? res.items[0] ?? null
    } catch {
      /* keep whatever we resolved */
    }
  }
  if (!service) return

  setService(service)
  trigger.value = service.name
  if (typeof q.link === 'string' && q.link) {
    link.value = q.link
    // Auto-highlight the platform chip matching the prefilled link so the
    // browse filter lines up with the re-ordered target. Only activated when
    // the link's platform is consistent with the service (or the service is
    // generic) AND a chip actually exists — a mismatched link keeps the chips
    // neutral and lets the form's amber mismatch warning explain itself.
    const detected = detectPlatform(link.value)
    const servicePlat = servicePlatform.value
    if (
      detected !== 'other' &&
      (servicePlat === 'other' || servicePlat === detected) &&
      platformChips.value.includes(detected as Platform)
    ) {
      platform.value = detected
    }
  }
  if (typeof q.quantity === 'string' && q.quantity) {
    const n = Number(q.quantity)
    if (Number.isFinite(n) && n > 0) quantity.value = n
  }
  if (typeof q.params === 'string' && q.params) {
    try {
      const parsed = JSON.parse(q.params) as Record<string, unknown>
      if (parsed && typeof parsed === 'object') {
        for (const [k, v] of Object.entries(parsed)) params[k] = String(v ?? '')
      }
    } catch {
      /* ignore malformed params */
    }
  }

  // Re-fetch so the catalogue (combobox + results pill) reflects the chip.
  if (platform.value) await loadServices()

  // Bring the pre-filled order form into view once the DOM has updated.
  await nextTick()
  document
    .querySelector('[data-order-form]')
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

onMounted(async () => {
  await Promise.allSettled([
    store.fetchCategories(),
    walletStore.fetchWallet(),
    loadServices(),
    loadAllServices(),
  ])
  await applyPrefill()
})
</script>

<template>
  <div class="w-full">
    <!-- Everything on one screen: Find your service → Service details → Order
         details — in a centered 70% column so the page stays readable. -->
    <div class="mx-auto w-full space-y-6 lg:w-[70%] xl:max-w-[1400px]">
    <!-- Header -->
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="font-display text-2xl font-bold text-ink">Explore Services</h1>
      </div>

      <!-- Platform quick filters (replaces the wallet balance card) -->
      <div class="flex flex-wrap items-center justify-end gap-2">
        <button
          v-for="p in platformChips"
          :key="p"
          type="button"
          class="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition-all active:scale-95"
          :class="
            platform === p
              ? 'border-brand-400/60 bg-brand-500/15 text-ink ring-1 ring-brand-400/40'
              : 'border-ink/10 bg-ink/5 text-ink/60 hover:border-brand-400/40 hover:text-ink'
          "
          :aria-pressed="platform === p"
          @click="selectPlatform(p)"
        >
          <PlatformIcon :platform="p" size="xs" tile />
          {{ platformLabel(p) }}
        </button>
      </div>
    </div>

    <!-- Step 1 — Find your service (full width) -->
    <div class="glass rounded-2xl p-5 shadow-card sm:p-7">
      <section class="space-y-4">
        <div class="flex items-center gap-2.5">
          <span
            class="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-secondary-500 text-[11px] font-bold text-white shadow-glow"
          >
            1
          </span>
          <h2 class="font-display text-base font-semibold text-ink">Find your service</h2>
        </div>

        <div class="relative">
          <Search
            class="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35"
          />
          <input
            v-model="search"
            type="search"
            placeholder="Search all services… e.g. Facebook Live"
            class="relative z-20 h-12 w-full rounded-xl border border-ink/10 bg-ink/5 pl-10 pr-4 text-sm text-ink placeholder:text-ink/30 transition-colors focus:border-brand-400/60 focus:outline-none focus:ring-2 focus:ring-brand-400/30"
            @focus="searchOpen = true; closePanel(); highlightedIndex = -1"
            @input="onSearchInput"
            @keydown="onSearchKeydown"
            @keydown.esc="closeSearch"
          />

          <!-- Click-away overlay for the search dropdown -->
          <div v-if="searchOpen" class="fixed inset-0 z-10" @click="closeSearch" />

          <!-- Live results dropdown: click a result to auto-pick it + its category -->
          <Transition name="fade">
            <div
              v-if="searchOpen && search.trim()"
              class="absolute z-40 mt-2 w-full overflow-hidden rounded-2xl border border-ink/10 bg-card/95 shadow-glow backdrop-blur-xl"
            >
              <div ref="searchListEl" class="max-h-80 overflow-y-auto p-1.5">
                <button
                  v-for="(s, index) in searchDropdownServices"
                  :key="s._id"
                  type="button"
                  class="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-ink/5"
                  :class="index === highlightedIndex ? 'bg-ink/10 ring-1 ring-brand-400/40' : ''"
                  @click="selectServiceFromSearch(s)"
                >
                  <span class="min-w-0">
                    <span class="block truncate text-sm font-medium text-ink">{{ s.name }}</span>
                    <span class="mt-0.5 block truncate text-xs text-ink/40">
                      {{ categoryName(s) || 'General' }} · {{ SERVICE_TYPE_LABEL[s.type] ?? s.type }}
                    </span>
                  </span>
                  <span class="shrink-0 text-right">
                    <span class="block text-xs font-semibold text-emerald-300">
                      {{ formatUnitPrice(s.pricePerUnit, s.currency) }}
                    </span>
                    <span class="block text-[10px] text-ink/35">
                      {{ formatNumber(s.min) }}–{{ formatNumber(s.max) }}
                    </span>
                  </span>
                </button>

                <p
                  v-if="!loading && !searchPending && searchDropdownServices.length === 0"
                  class="px-3 py-6 text-center text-sm text-ink/40"
                >
                  No services found for “{{ search.trim() }}”.
                </p>
                <p
                  v-else-if="(loading || searchPending) && searchDropdownServices.length === 0"
                  class="space-y-2 px-3 py-4"
                >
                  <BaseSkeleton v-for="n in 3" :key="n" class="h-10 w-full" />
                </p>
              </div>
            </div>
          </Transition>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <!-- Category -->
          <BaseSelect
            :model-value="categoryId"
            label="Category"
            :options="categoryOptions"
            @update:model-value="categoryId = $event; changeCategory()"
          />

          <!-- Service combobox — type to search, click or Enter to select -->
          <div class="block">
            <span class="mb-1.5 block text-sm font-medium text-ink/80">Service</span>
            <div class="relative">
              <Search
                class="pointer-events-none absolute left-3.5 top-1/2 z-30 h-4 w-4 -translate-y-1/2 text-ink/35"
              />
              <input
                v-model="trigger"
                type="text"
                role="combobox"
                :aria-expanded="panelOpen"
                placeholder="Search or select a service…"
                autocomplete="off"
                spellcheck="false"
                class="relative z-30 h-11 w-full rounded-xl border border-ink/10 bg-ink/5 pl-10 pr-10 text-sm text-ink placeholder:text-ink/30 transition-colors focus:border-brand-400/60 focus:outline-none focus:ring-2 focus:ring-brand-400/30"
                @focus="openServicePanel"
                @input="onPanelInput"
                @keydown="onPanelKeydown"
                @keydown.esc="closePanel"
                @blur="closePanel"
              />
              <ChevronDown
                class="pointer-events-none absolute right-3.5 top-1/2 z-30 h-4 w-4 -translate-y-1/2 text-ink/40 transition-transform"
                :class="panelOpen ? 'rotate-180' : ''"
              />

              <!-- Click-away overlay -->
              <div v-if="panelOpen" class="fixed inset-0 z-20" @click="closePanel" />

              <Transition name="fade">
                <div
                  v-if="panelOpen"
                  class="absolute z-40 mt-2 w-full overflow-hidden rounded-2xl border border-ink/10 bg-card/95 shadow-glow backdrop-blur-xl"
                >
                  <div ref="panelListEl" class="max-h-72 overflow-y-auto p-1.5">
                    <!-- Sectioned: the selected category's services first, then
                         the WHOLE catalogue — changing the service is never
                         trapped inside the current filter. -->
                    <template v-for="(group, gi) in panelGroups" :key="gi">
                      <p
                        v-if="group.label"
                        class="sticky top-0 z-10 bg-card/95 px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-ink/35 backdrop-blur"
                      >
                        {{ group.label }}
                      </p>
                      <button
                        v-for="s in group.items"
                        :key="s._id"
                        type="button"
                        class="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-ink/5"
                        :class="
                          selected?._id === s._id
                            ? 'bg-brand-500/15'
                            : panelIndexById.get(s._id) === panelIndex
                              ? 'bg-ink/10 ring-1 ring-brand-400/40'
                              : ''
                        "
                        @mousedown.prevent
                        @click="selectService(s)"
                      >
                        <span class="min-w-0">
                          <span class="block truncate text-sm font-medium text-ink">
                            <Check
                              v-if="selected?._id === s._id"
                              class="mr-1 inline h-3.5 w-3.5 text-brand-300"
                            />
                            {{ s.name }}
                          </span>
                          <span class="mt-0.5 block truncate text-xs text-ink/40">
                            {{ categoryName(s) || 'General' }} · {{ SERVICE_TYPE_LABEL[s.type] ?? s.type }}
                          </span>
                        </span>
                        <span class="shrink-0 text-right">
                          <span class="block text-xs font-semibold text-emerald-300">
                            {{ formatUnitPrice(s.pricePerUnit, s.currency) }}
                          </span>
                          <span class="block text-[10px] text-ink/35">
                            {{ formatNumber(s.min) }}–{{ formatNumber(s.max) }}
                          </span>
                        </span>
                      </button>
                    </template>

                    <p
                      v-if="!loading && dropdownServices.length === 0"
                      class="px-3 py-6 text-center text-sm text-ink/40"
                    >
                      No services match — try a different search or category.
                    </p>
                    <p
                      v-else-if="loading && dropdownServices.length === 0"
                      class="space-y-2 px-3 py-4"
                    >
                      <BaseSkeleton v-for="n in 4" :key="n" class="h-10 w-full" />
                    </p>
                  </div>
                </div>
              </Transition>
            </div>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2 text-xs text-ink/40">
          <span v-if="search.trim() || platform" class="rounded-full bg-ink/5 px-2.5 py-1">
            <template v-if="search.trim()">
              “{{ search.trim() }}” ·
            </template>
            <template v-else-if="platform">
              {{ platformLabel(platform) }} ·
            </template>
            {{ services.length.toLocaleString() }} result{{
              services.length === 1 ? '' : 's'
            }}
          </span>
          <button
            v-if="loadError"
            class="inline-flex items-center gap-1 font-medium text-brand-300 hover:text-brand-200"
            @click="loadServices"
          >
            <RotateCcw class="h-3 w-3" /> {{ loadError }} — retry
          </button>
          <button
            v-else-if="search || categoryId || platform"
            class="rounded-full bg-ink/5 px-2.5 py-1 transition-colors hover:bg-ink/10 hover:text-ink"
            @click="search = ''; categoryId = ''; platform = ''; changeCategory()"
          >
            Clear filters
          </button>
        </div>
      </section>
    </div>

    <!-- ==============================================================
         Order form — single vertical card
         ============================================================== -->
    <div v-if="selected" data-order-form class="w-full scroll-mt-24">
      <div class="glass space-y-6 rounded-2xl p-5 shadow-card sm:p-7">
        <!-- Step 2 — Selected service details -->
        <section class="space-y-4">
          <div class="mb-4 flex items-center gap-2.5">
            <span
              class="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-secondary-500 text-[11px] font-bold text-white shadow-glow"
            >
              2
            </span>
            <h2 class="font-display text-base font-semibold text-ink">Service details</h2>
          </div>

          <div class="relative overflow-hidden rounded-2xl border border-ink/10 bg-ink/[0.03] p-5">
            <div
              class="pointer-events-none absolute -right-14 -top-14 h-40 w-40 rounded-full bg-gradient-to-br opacity-10 blur-2xl"
              :class="servicePlatform !== 'other' ? 'from-brand-500 to-secondary-500' : 'from-slate-500 to-slate-400'"
            />
            <div class="relative">
              <div class="flex items-start justify-between gap-3">
                <div class="flex min-w-0 items-center gap-3">
                  <PlatformIcon :platform="servicePlatform" size="md" tile />
                  <div class="min-w-0">
                    <h3 class="font-display truncate text-base font-semibold text-ink">
                      {{ selected.name }}
                    </h3>
                    <p class="mt-0.5 text-xs text-ink/45">{{ serviceTypeLabel }}</p>
                  </div>
                </div>
                <div class="flex shrink-0 flex-col items-end gap-1.5">
                  <span class="rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                    {{ formatUnitPrice(selected.pricePerUnit, selected.currency) }} / 1,000
                  </span>
                </div>
              </div>

              <p v-if="selected.description" class="mt-3 text-sm leading-relaxed text-ink/55">
                {{ selected.description }}
              </p>

              <div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div class="rounded-xl bg-ink/[0.04] px-3 py-2.5">
                  <p class="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-ink/35">
                    <Clock class="h-3 w-3" /> Average time
                  </p>
                  <p class="mt-0.5 text-sm font-semibold text-ink">
                    {{ selected.deliveryTime || '—' }}
                  </p>
                </div>
                <div class="rounded-xl bg-ink/[0.04] px-3 py-2.5">
                  <p class="text-[11px] uppercase tracking-wider text-ink/35">Quantity range</p>
                  <p class="mt-0.5 text-sm font-semibold text-ink">
                    {{ formatNumber(selected.min) }} – {{ formatNumber(selected.max) }}
                  </p>
                </div>
                <div class="rounded-xl bg-ink/[0.04] px-3 py-2.5">
                  <p class="text-[11px] uppercase tracking-wider text-ink/35">Refill</p>
                  <p class="mt-0.5 text-sm font-semibold" :class="selected.refill ? 'text-emerald-300' : 'text-ink/40'">
                    {{ selected.refill ? 'Yes' : 'No' }}
                  </p>
                </div>
                <div class="rounded-xl bg-ink/[0.04] px-3 py-2.5">
                  <p class="text-[11px] uppercase tracking-wider text-ink/35">Cancel</p>
                  <p class="mt-0.5 text-sm font-semibold" :class="selected.cancel ? 'text-emerald-300' : 'text-ink/40'">
                    {{ selected.cancel ? 'Yes' : 'No' }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Step 3 — Order details -->
        <section class="space-y-4">
          <div class="mb-4 flex items-center gap-2.5">
            <span
              class="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-secondary-500 text-[11px] font-bold text-white shadow-glow"
            >
              3
            </span>
            <h2 class="font-display text-base font-semibold text-ink">Order details</h2>
          </div>

          <div class="space-y-4">
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

          <div v-if="quantityRequired" class="space-y-1.5">
            <label class="text-xs font-medium text-ink/60">Quantity</label>
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-ink/10 bg-ink/5 text-ink/70 transition-all hover:border-brand-400/50 hover:text-ink active:scale-95 disabled:opacity-30"
                :disabled="(quantity ?? (selected?.min ?? 0)) <= (selected?.min ?? 0)"
                aria-label="Decrease quantity"
                @click="adjustQuantity(-1)"
              >
                <Minus class="h-4 w-4" />
              </button>
              <BaseInput
                :model-value="quantity"
                class="flex-1"
                type="number"
                :min="selected?.min"
                :max="selected?.max"
                :placeholder="selected ? formatNumber(selected.min) + ' – ' + formatNumber(selected.max) : ''"
                :error="error && !quantity ? error : ''"
                @update:model-value="
                  quantity = $event === '' || $event === null ? null : Number($event)
                "
              />
              <button
                type="button"
                class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-ink/10 bg-ink/5 text-ink/70 transition-all hover:border-brand-400/50 hover:text-ink active:scale-95 disabled:opacity-30"
                :disabled="(quantity ?? 0) >= (selected?.max ?? 0)"
                aria-label="Increase quantity"
                @click="adjustQuantity(1)"
              >
                <Plus class="h-4 w-4" />
              </button>
            </div>
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
          </div>
        </section>

        <!-- Footer: charge + balance + submit -->
        <footer class="border-t border-ink/10 pt-5">
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p class="text-sm text-ink/50">
                Charge
                <span v-if="totalPrice > 0" class="ml-1 text-xs text-ink/30">
                  {{ formatUnitPrice(selected.pricePerUnit, selected.currency) }}
                  × {{ formatNumber(quantity ?? (selected.min > 0 ? selected.min : 1)) }} / 1,000
                </span>
              </p>
              <p class="mt-0.5 font-display text-3xl font-bold text-ink">
                {{ formatMoney(totalPrice) }}
              </p>
            </div>

            <div class="flex items-center gap-4 text-sm">
              <div class="text-right">
                <p class="text-xs text-ink/40">Balance</p>
                <p class="font-semibold text-ink">{{ formatMoney(balance) }}</p>
              </div>
              <div
                v-if="totalPrice > 0 && !insufficient"
                class="rounded-xl bg-emerald-400/10 px-3 py-2 text-right"
              >
                <p class="text-xs text-emerald-300/70">After order</p>
                <p class="font-semibold text-emerald-300">{{ formatMoney(balanceAfter) }}</p>
              </div>
            </div>
          </div>

          <p v-if="error" class="mt-3 text-sm text-rose-300">{{ error }}</p>

          <BaseButton size="lg" block class="mt-4" :loading="submitting" @click="submit">
            Place order <ArrowUpRight class="h-4 w-4" />
          </BaseButton>
        </footer>

        <!-- Insufficient balance alert -->
        <div
          v-if="selected && insufficient"
          class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4"
        >
          <div class="flex min-w-0 items-center gap-3">
            <div
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-400/15 text-amber-300"
            >
              <Wallet class="h-4 w-4" />
            </div>
            <div class="min-w-0">
              <p class="text-sm font-semibold text-amber-200">Not enough balance for this order</p>
              <p class="mt-0.5 text-xs text-amber-300">
                Top up <b>{{ formatMoney(shortfall) }}</b> more to buy this service.
              </p>
            </div>
          </div>
          <BaseButton
            variant="secondary"
            size="sm"
            @click="router.push('/dashboard/wallet')"
          >
            Top up wallet <ArrowUpRight class="h-3.5 w-3.5" />
          </BaseButton>
        </div>
      </div>
    </div>

    <!-- Empty state before any service is picked -->
    <div
      v-else
      class="flex w-full flex-col items-center justify-center rounded-2xl border border-dashed border-ink/10 px-6 py-16 text-center"
    >
      <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-ink/5 text-ink/30">
        <Search class="h-6 w-6" />
      </div>
      <p class="mt-3 text-sm text-ink/40">Pick a service above to get started.</p>
    </div>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
