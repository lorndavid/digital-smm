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
  Star,
  Wallet,
  XCircle,
} from '@lucide/vue'
import { watchDebounced } from '@vueuse/core'
import { servicesApi } from '@/api/services.api'
import { ordersApi } from '@/api/orders.api'
import { ApiRequestError } from '@/api/client'
import { useServicesStore } from '@/stores/services.store'
import { useWalletStore } from '@/stores/wallet.store'
import { useFavoritesStore } from '@/stores/favorites.store'
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
import { formatMoney, formatNumber, formatServiceId, formatUnitPrice } from '@/utils/format'
import { SERVICE_TYPE_LABEL, PLATFORM_META } from '@/utils/constants'
import PlatformIcon from '@/components/ui/PlatformIcon.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import BaseTextarea from '@/components/ui/BaseTextarea.vue'
import BaseSkeleton from '@/components/ui/BaseSkeleton.vue'
import BaseSpinner from '@/components/ui/BaseSpinner.vue'
import type { Category, Platform, Service } from '@/types/models'

const store = useServicesStore()
const walletStore = useWalletStore()
const favoritesStore = useFavoritesStore()
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

/** Selected service name shown in the (read-only) Service trigger. */
const trigger = ref('')
const panelOpen = ref(false)
/** Category group labels currently collapsed in the dropdown (rows hidden). */
const collapsedGroups = ref<Set<string>>(new Set())
/** Index of the keyboard-highlighted row in the service dropdown (-1 = none). */
const panelIndex = ref(-1)
/** Scrollable results container inside the service dropdown. */
const panelListEl = ref<HTMLElement | null>(null)
/** Autocomplete dropdown under the main search box. */
const searchOpen = ref(false)
/** Index of the keyboard-highlighted row in the search dropdown (-1 = none). */
const highlightedIndex = ref(-1)
/** Scrollable results container inside the search dropdown. */
const searchListEl = ref<HTMLElement | null>(null)

/** Category combobox trigger input — focused when the chevron opens it. */
const categoryTriggerEl = ref<HTMLInputElement | null>(null)
/** Service combobox trigger input — focused when the chevron opens it. */
const serviceTriggerEl = ref<HTMLInputElement | null>(null)

/** Search text inside the Category combobox (client-side, instant). */
const categorySearch = ref('')
/**
 * True while the user is actively typing in the category field. A plain
 * click/focus (even with the selected category's name still in the field)
 * opens the FULL category list; typing filters it live; picking resets it.
 */
const categoryDirty = ref(false)
const categoryOpen = ref(false)
/** Index of the keyboard-highlighted row in the category dropdown (-1 = none). */
const categoryIndex = ref(-1)
/** Scrollable results container inside the category dropdown. */
const categoryListEl = ref<HTMLElement | null>(null)
/** 'Favourites only' filter inside the Category dropdown — shows only the
 *  categories the customer starred. */
const favFilter = ref(false)

const selected = ref<Service | null>(null)

/** True while a prefill (favourite click / order again) is being applied —
 *  drives the loading animation until the order form is ready. */
const prefillPending = ref(false)

/** Active platform chip ('facebook', 'tiktok', … — '' = all platforms). */
const platform = ref('')

/** 'Facebook Live' is a MAIN quick-filter chip (the 6th), just like the five
 *  platforms — clicking it filters categories whose NAME contains the
 *  'facebook live' keyword (the same rule the backend uses to resolve a
 *  platform), so the Category dropdown and the Service list both line up. */
const LIVE_PLATFORM = 'facebook live'

/**
 * Category dropdown options. When a platform chip is active, only categories
 * whose name contains the platform keyword are listed (the same rule the
 * backend uses to resolve a platform into category ids) — clicking "Facebook"
 * shows Facebook categories only, "TikTok" shows TikTok ones, and so on.
 */
const categoryOptions = computed(() => {
  const keyword = platform.value?.toLowerCase()
  const cats = keyword
    ? store.categories.filter((c) => c.name.toLowerCase().includes(keyword))
    : store.categories
  return [
    { value: '', label: 'All categories' },
    ...cats.map((c) => ({ value: c._id, label: c.name })),
  ]
})

interface PlatformChip {
  /** Value set on `platform` when the chip is active. */
  key: string
  /** Brand icon + tile shown on the chip (Facebook Live reuses the Facebook logo). */
  icon: Platform
  label: string
  /** Shorter label for phone screens (the 3-column chip grid is narrow). */
  short: string
}

/**
 * Quick-filter chips shown in the header — one per platform that actually has
 * categories in the catalogue (curated, so chips never point at an empty
 * platform), plus the always-visible 'Facebook Live' chip. Ordered like a
 * real SMM panel: Facebook, TikTok, Instagram, YouTube, Telegram, Facebook
 * Live. The generic "other" bucket is omitted — it has no meaningful
 * icon/label to show.
 */
const platformChips = computed<PlatformChip[]>(() => {
  const present = new Set(store.categories.map((c) => c.platform))
  const order: Array<[Platform, string]> = [
    ['facebook', 'Facebook'],
    ['tiktok', 'TikTok'],
    ['instagram', 'Instagram'],
    ['youtube', 'YouTube'],
    ['telegram', 'Telegram'],
  ]
  const SHORT_LABEL: Record<Platform, string> = {
    facebook: 'FB',
    tiktok: 'TT',
    instagram: 'IG',
    youtube: 'YT',
    telegram: 'TG',
    other: '',
  }
  const chips: PlatformChip[] = order
    .filter(([p]) => present.has(p))
    .map(([p, label]) => ({
      key: p,
      icon: p,
      label,
      short: SHORT_LABEL[p] || label,
    }))
  // Facebook Live is a main category too — always shown (the keyword filter
  // matches category NAMES, so it works even before platform inference).
  chips.push({ key: LIVE_PLATFORM, icon: 'facebook', label: 'Facebook Live', short: 'FB Live' })
  return chips
})

/** Label for a platform chip (falls back to the raw key). */
function platformLabel(p: string): string {
  if (p === LIVE_PLATFORM) return 'Facebook Live'
  return PLATFORM_META[p as Platform]?.label ?? p
}

/** Monotonic request id — only the newest search response may apply. */
let searchSeq = 0

async function loadServices(seq?: number): Promise<void> {
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
    // Fast typing must never let a stale response overwrite newer results.
    if (seq !== undefined && seq !== searchSeq) {
      loading.value = false
      return
    }
    services.value = result.items
    loading.value = false
  } catch (err) {
    if (seq !== undefined && seq !== searchSeq) {
      loading.value = false
      return
    }
    loadError.value = err instanceof ApiRequestError ? err.message : 'Failed to load services'
    loading.value = false
  }
}

watchDebounced(
  [search],
  () => {
    // Typing is served 100% client-side by the ranked search over the cached
    // full catalogue — never hit the server per keystroke (fast, no rate-limit
    // spikes, no request leak). While a query is active we only (re)trigger the
    // idempotent full-catalogue load — it retries a failed mount-time load and
    // shares one in-flight promise, so no duplicate requests. The search
    // endpoint is only re-queried when browsing with an EMPTY box.
    if (!search.value.trim()) void loadServices(++searchSeq)
    else void loadAllServices()
  },
  { debounce: 120 },
)

/**
 * A browse-filter switch is a fresh start: drop any active search, deselect
 * the service and clear the order form so the user picks a service for the
 * new category/platform. (The service dropdown afterwards shows ONLY the new
 * filter's services — grouped, with no other categories leaking in.)
 */
function resetOrderFlow(): void {
  search.value = ''
  clearOrder()
  selected.value = null
  trigger.value = ''
  collapsedGroups.value = new Set()
  closeSearch()
  closeCategory()
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

/** Whole catalogue (no category/platform/search filters) — the fallback list
 *  shown when the combobox is opened, so changing the service is never
 *  trapped inside the current category's filtered list. It also backs the
 *  ranked search, so it is fetched page by page until the full catalogue is
 *  covered — a provider catalogue larger than the 1,000-row API cap must not
 *  hide matching services from the search. */
const allServices = ref<Service[]>([])
let allServicesLoaded = false
/** Highest page already merged into allServices (1-based) — a retry after a
 *  partial failure resumes from the next page instead of restarting. */
let allServicesPage = 0
/**
 * In-flight guard: fast typing must never spawn a SECOND full pagination
 * loop while the first is still running (each loop is N × 1,000-row
 * requests). Concurrent callers share the same promise.
 */
let allServicesPromise: Promise<void> | null = null

/** Dedupe-append services into the cached full catalogue. */
function mergeAllServices(items: Service[]): void {
  const seen = new Set(allServices.value.map((s) => s._id))
  for (const s of items) {
    if (seen.has(s._id)) continue
    seen.add(s._id)
    allServices.value.push(s)
  }
}

/** Loads the FULL catalogue (every page). Idempotent + re-entrant: concurrent
 *  callers share one in-flight promise instead of firing duplicate loops. */
function loadAllServices(): Promise<void> {
  if (allServicesLoaded) return Promise.resolve()
  if (!allServicesPromise) {
    allServicesPromise = (async () => {
      try {
        const first = await servicesApi.list({ limit: 1000 })
        // Commit page 1 immediately so a later failure never discards it.
        mergeAllServices(first.items)
        allServicesPage = Math.max(allServicesPage, 1)
        const pages = Math.ceil(first.total / 1000)
        for (let page = allServicesPage + 1; page <= pages; page++) {
          const res = await servicesApi.list({ limit: 1000, page })
          mergeAllServices(res.items)
          allServicesPage = page
        }
        allServicesLoaded = true
      } catch {
        /* Keep whatever pages merged so far — a failed page never discards the
           rest, and the union with the server list still fills the dropdown. */
      }
    })().finally(() => {
      allServicesPromise = null
    })
  }
  return allServicesPromise
}

/**
 * Prebuilt lowercased search haystacks (name + category + description) —
 * built once per service and reused across keystrokes, so typing only runs
 * cheap substring checks instead of re-concatenating + re-lowercasing every
 * service on every input event.
 */
const searchHaystackById = new Map<string, string>()
function searchHaystack(s: Service): string {
  let haystack = searchHaystackById.get(s._id)
  if (haystack === undefined) {
    haystack = `${s.name} ${categoryLabel(s)} ${s.description ?? ''}`.toLowerCase()
    searchHaystackById.set(s._id, haystack)
  }
  return haystack
}

// Categories load asynchronously and their names feed the haystack — rebuild
// once they arrive (and whenever the browse list is replaced) so search never
// scores against a stale 'General' label.
watch(
  [() => store.categories, () => services.value],
  () => searchHaystackById.clear(),
)

interface PanelGroup {
  label: string
  items: Service[]
}

function categoryLabel(service: Service): string {
  const cat = service.category
  if (cat && typeof cat === 'object' && 'name' in cat) return cat.name
  if (typeof cat === 'string') {
    return store.categories.find((c) => c._id === cat)?.name ?? 'General'
  }
  return 'General'
}

/** SMMWiz provider service id, rendered as a compact '#12345' tag. */
function serviceId(service: Service): string {
  return formatServiceId(service.providerServiceId)
}

/**
 * Rows shown in the service dropdown, sectioned like a real SMM panel. The
 * Service field is a read-only trigger — no typing search here; search lives
 * in the Find-your-service box and the Category combobox.
 *
 * SCOPED to the active filter, like a real SMM panel:
 *   - a selected category shows ONLY that category's services (one group),
 *   - an active platform chip shows only that platform's categories,
 *   - with no filter the WHOLE catalogue appears grouped by category.
 * No other categories' services ever leak in while a filter is active.
 * Services inside a group are sorted by price, cheapest first.
 */
const panelGroups = computed<PanelGroup[]>(() => {
  const activeCatId = categoryId.value
  const activeName = activeCatId
    ? (store.categories.find((c) => c._id === activeCatId)?.name ?? '')
    : ''
  const keyword = platform.value ? platform.value.toLowerCase() : ''

  // A service belongs in the dropdown only when it matches the active
  // category id AND (if a platform chip is on) the platform keyword. The
  // platform check matches by CATEGORY NAME containing the keyword — the same
  // rule categoryOptions and the backend use — so the dropdown never
  // contradicts the server-filtered browse list (a real provider catalogue
  // names categories "Facebook Video", "TikTok Views", … regardless of the
  // category's platform field).
  const inScope = (s: Service): boolean => {
    if (activeCatId) {
      const cat = s.category
      const sid =
        cat && typeof cat === 'object' && cat._id
          ? String(cat._id)
          : typeof cat === 'string'
            ? cat
            : ''
      if (sid !== activeCatId) return false
    }
    if (keyword && !categoryLabel(s).toLowerCase().includes(keyword)) return false
    return true
  }

  // Merge the scoped browse list with the scoped rest of the catalogue, then
  // bucket every in-scope service under its category name.
  const preferred = services.value.filter(inScope)
  const preferredIds = new Set(preferred.map((s) => s._id))
  const merged = [
    ...preferred,
    ...allServices.value.filter((s) => !preferredIds.has(s._id) && inScope(s)),
  ]

  const byLabel = new Map<string, Service[]>()
  for (const s of merged) {
    const label = categoryLabel(s)
    const list = byLabel.get(label)
    if (list) list.push(s)
    else byLabel.set(label, [s])
  }

  const curatedIndex = new Map(store.categories.map((c, i) => [c.name, i]))

  // Group order: active category first, then the active platform's
  // categories (name-based, same rule as inScope), then the rest in curated
  // order (unknown names at the end).
  const rank = (label: string): number => {
    if (activeName && label === activeName) return -1
    if (keyword && label.toLowerCase().includes(keyword)) {
      return curatedIndex.get(label) ?? 1000
    }
    return 1000 + (curatedIndex.get(label) ?? 2000)
  }

  const groups: PanelGroup[] = [...byLabel.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
    .map(([label, items]) => ({
      label,
      // Cheapest first inside each group (rate per 1,000 units).
      items: [...items].sort((a, b) => a.pricePerUnit - b.pricePerUnit),
    }))

  // The selected service is always visible at the very top of the list.
  if (selected.value && !groups.some((g) => g.items.some((s) => s._id === selected.value?._id))) {
    groups.unshift({ label: 'Selected', items: [selected.value] })
  }
  return groups
})

/**
 * Flat projection of the VISIBLE dropdown rows — drives keyboard navigation.
 * Rows inside collapsed groups are excluded so arrow-key indices stay aligned
 * with what's actually on screen.
 */
const dropdownServices = computed<Service[]>(() =>
  panelGroups.value.flatMap((g) => (isGroupCollapsed(g.label) ? [] : g.items)),
)

/**
 * True when the panel has nothing to show at all — no visible rows AND no
 * group holds any items. Collapsed groups with services keep this false, so
 * collapsing every group never triggers a misleading "no results" message.
 */
const panelEmpty = computed(
  () =>
    dropdownServices.value.length === 0 &&
    panelGroups.value.every((g) => g.items.length === 0),
)

/** Row id → flat index, so the keyboard highlight works across sections. */
const panelIndexById = computed(() => new Map(dropdownServices.value.map((s, i) => [s._id, i])))

/** Splits a query into lowercased terms (space-separated words). */
function searchTerms(q: string): string[] {
  return q.trim().toLowerCase().split(/\s+/).filter(Boolean)
}

/**
 * Search aliases: provider catalogues abbreviate platforms (FB, IG, TT, YT)
 * and collapse live/streaming variants — so "facebook live stream" or
 * "tiktok live stream" expands to tokens that hit services named "FB Live
 * Views", "TT Live Stream Comments", etc. Matching only needs ANY alias of a
 * term to appear in name/category/description.
 */
const SEARCH_ALIASES: Record<string, string[]> = {
  facebook: ['facebook', 'fb'],
  tiktok: ['tiktok', 'tt'],
  instagram: ['instagram', 'ig'],
  youtube: ['youtube', 'yt'],
  telegram: ['telegram', 'tg'],
  live: ['live', 'livestream', 'stream', 'streaming', 'broadcast'],
  stream: ['stream', 'livestream', 'streaming', 'broadcast', 'live'],
  views: ['views', 'view'],
  likes: ['likes', 'like'],
  followers: ['followers', 'follower'],
  subscribers: ['subscribers', 'subscriber', 'subs', 'sub'],
  members: ['members', 'member'],
  comments: ['comments', 'comment'],
  reels: ['reels', 'reel'],
  shares: ['shares', 'share'],
  reactions: ['reactions', 'reaction'],
  plays: ['plays', 'play'],
}

/** All tokens that can stand in for a query term (aliases or the term itself). */
function termTokens(term: string): string[] {
  return SEARCH_ALIASES[term] ?? [term]
}

/**
 * Services listed under the search box while the user types (instant,
 * client-side). This is a RANKED search over the WHOLE catalogue: every
 * service whose name, category or description contains ANY word of the query
 * (or one of its aliases) is included, ordered by how many words it matches
 * (a full "facebook live stream" match leads; a partial "facebook"-only
 * match trails). The source is the union of the cached full catalogue AND the
 * server's search results, so the dropdown can never silently come up empty
 * — even when the cached load failed or a big catalogue paginated the
 * matching services beyond the first page. No platform icons, no category
 * rows — a clean flat list. Haystacks are memoized (see searchHaystack) so a
 * keystroke only does substring checks — no string rebuilding per service.
 */
const searchDropdownServices = computed<Service[]>(() => {
  const terms = searchTerms(search.value)
  if (!terms.length) return []
  // Union of both sources, deduped — the server's any-word results always
  // contribute, filling gaps the cached full-catalogue list may have.
  const sourceById = new Map<string, Service>()
  for (const s of services.value) if (!sourceById.has(s._id)) sourceById.set(s._id, s)
  for (const s of allServices.value) if (!sourceById.has(s._id)) sourceById.set(s._id, s)
  const source = [...sourceById.values()]

  const scored: Array<{ service: Service; score: number }> = []
  for (const s of source) {
    const haystack = searchHaystack(s)
    let score = 0
    for (const term of terms) {
      if (termTokens(term).some((t) => haystack.includes(t))) score++
    }
    if (score > 0) scored.push({ service: s, score })
  }
  // Best matches first, then cheapest — a real SMM-panel-style search.
  return scored
    .sort((a, b) => b.score - a.score || a.service.pricePerUnit - b.service.pricePerUnit)
    .map((s) => s.service)
})

/** Rendered slice of the ranked results (keeps the DOM light on broad
 *  queries) — keyboard navigation works against this same capped list. */
const searchDropdownResults = computed<Service[]>(() =>
  searchDropdownServices.value.slice(0, 100),
)

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

/** Fired as the user types — keeps the search GLOBAL (client-side, instant). */
function onSearchInput(): void {
  // Make sure the WHOLE catalogue is available for the ranked search. If the
  // mount-time load failed (network blip, rate limit), this retries it —
  // the dropdown must never fall back to a narrow/failed server list.
  void loadAllServices()
  // A fresh query searches the whole catalogue: drop any auto-set or manual
  // category so results are never silently scoped to one category.
  if (selected.value && search.value !== selected.value.name) {
    categoryId.value = ''
  }
  highlightedIndex.value = -1
}

/** Closes the search dropdown and clears its keyboard highlight. */
function closeSearch(): void {
  searchOpen.value = false
  highlightedIndex.value = -1
}

/**
 * Category rows for the searchable Category combobox. Typing filters the
 * curated options instantly on the client — no server round-trip, so fast
 * typing never leaks requests. 'All categories' always leads the list.
 */
const categoryRows = computed<Array<{ value: string; label: string }>>(() => {
  // A plain open (click/focus) shows the FULL list even when the selected
  // category's name is still in the field — only typing narrows it, so the
  // panel never traps the user inside the current selection's filter.
  const q = categoryDirty.value ? categorySearch.value.trim().toLowerCase() : ''
  const matches = categoryOptions.value.filter(
    (o) =>
      o.value !== '' &&
      (!q || o.label.toLowerCase().includes(q)) &&
      // The favourites filter keeps only starred categories — it combines
      // with the typeahead and the active platform chip's scoping.
      (!favFilter.value || favoritesStore.isFavorite(o.value)),
  )
  // 'All categories' is omitted while the favourites filter is active — the
  // list is a pure favourites view and the toggle itself is the way out.
  const rows = favFilter.value
    ? matches
    : [{ value: '', label: 'All categories' }, ...matches]
  // On a fresh open (no typing) the CURRENTLY SELECTED category is pinned
  // right after 'All categories' (or at the very top in favourites mode) so
  // the user always sees their selection first — with its star button right
  // there to favourite/unfavourite. Typing never reorders the list.
  if (!categoryDirty.value && categoryId.value) {
    const idx = rows.findIndex((r) => r.value === categoryId.value)
    if (idx > 0) {
      const [sel] = rows.splice(idx, 1)
      rows.splice(favFilter.value ? 0 : 1, 0, sel)
    }
  }
  return rows
})

/** Opens the category dropdown (trigger's focus/click event). */
function openCategoryPanel(): void {
  categoryDirty.value = false
  categoryOpen.value = true
  categoryIndex.value = -1
  closePanel()
  closeSearch()
}

/**
 * Clicking the category field reopens the dropdown even when the field
 * already has focus — picking a row keeps focus in the input (mousedown
 * is prevented on the row), so a focused input never fires focus again and
 * a second click would otherwise do nothing. An open panel stays open so
 * typing to filter still works.
 */
function onCategoryFieldClick(): void {
  if (!categoryOpen.value) openCategoryPanel()
}

/** Toggles the category dropdown from its chevron button — click again to hide.
 *  Opening also focuses the trigger so arrow-key/Enter navigation works
 *  immediately (the chevron's mousedown.prevent leaves focus where it was). */
function toggleCategoryPanel(): void {
  if (categoryOpen.value) closeCategory()
  else {
    openCategoryPanel()
    categoryTriggerEl.value?.focus()
  }
}

/** Toggles the 'favourites only' filter inside the Category dropdown. */
function toggleFavFilter(): void {
  favFilter.value = !favFilter.value
  categoryIndex.value = -1
}

/** Closes the category dropdown, restoring the selected label in the field. */
function closeCategory(): void {
  categoryDirty.value = false
  categoryOpen.value = false
  categoryIndex.value = -1
  const cat = store.categories.find((c) => c._id === categoryId.value)
  categorySearch.value = cat?.name ?? ''
}

/** Typing in the category field filters instantly (client-side, no requests). */
function onCategoryInput(): void {
  categoryDirty.value = true
  categoryOpen.value = true
  categoryIndex.value = -1
}

/** Applies a picked category to the browse filter. */
function selectCategoryRow(row: { value: string; label: string }): void {
  categoryDirty.value = false
  categoryId.value = row.value
  categorySearch.value = row.label === 'All categories' ? '' : row.label
  // If the picked category is not part of the active platform chip, the
  // Category dropdown would land on an invisible value — deactivate the chip
  // so the browse filter always matches the category the user just chose.
  if (platform.value && row.value && !categoryOptions.value.some((o) => o.value === row.value)) {
    platform.value = ''
  }
  changeCategory()
  categoryOpen.value = false
  categoryIndex.value = -1
}

/** Arrow up/down + Enter navigation inside the category dropdown. */
function onCategoryKeydown(event: KeyboardEvent): void {
  const list = categoryRows.value
  if (list.length === 0) return
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    if (!categoryOpen.value) categoryOpen.value = true
    categoryIndex.value =
      event.key === 'ArrowDown'
        ? (categoryIndex.value + 1) % list.length
        : categoryIndex.value < 0
          ? list.length - 1
          : (categoryIndex.value - 1 + list.length) % list.length
  } else if (event.key === 'Enter') {
    const row = list[categoryIndex.value]
    if (row) {
      event.preventDefault()
      selectCategoryRow(row)
    }
  }
}

// Keep the highlighted category visible while navigating with arrow keys.
// Only the select buttons carry [data-category-option] — the star buttons
// (favourites) sit next to each row and must not shift the highlight index.
watch(
  categoryIndex,
  (index) => {
    if (index < 0) return
    categoryListEl.value
      ?.querySelectorAll('button[data-category-option]')
      [index]?.scrollIntoView({ block: 'nearest' })
  },
  { flush: 'post' },
)

/** Toggles a category in the customer's favourites (optimistic, server-synced). */
function toggleFavorite(categoryId: string): void {
  favoritesStore
    .toggle(categoryId)
    .then(() => {
      const added = favoritesStore.isFavorite(categoryId)
      toast.success(
        added
          ? 'Added to favourites'
          : 'Removed from favourites',
      )
    })
    .catch(() => {
      toast.error('Could not update favourites')
    })
}

/** Toggles a service in the customer's favourites (optimistic, server-synced). */
function toggleServiceFavorite(serviceId: string): void {
  favoritesStore
    .toggleService(serviceId)
    .then(() => {
      const added = favoritesStore.isServiceFavorite(serviceId)
      toast.success(
        added
          ? 'Service added to favourites'
          : 'Service removed from favourites',
      )
    })
    .catch(() => {
      toast.error('Could not update favourites')
    })
}

/** Arrow up/down + Enter navigation for the search results dropdown. */
function onSearchKeydown(event: KeyboardEvent): void {
  const list = searchDropdownResults.value
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

// Keep the highlighted service row visible while navigating with arrow keys.
// Only rows tagged [data-search-service] exist in the search dropdown, so the
// highlight index stays perfectly aligned with the on-screen rows.
watch(
  highlightedIndex,
  (index) => {
    if (index < 0) return
    searchListEl.value
      ?.querySelectorAll('button[data-search-service]')
      [index]?.scrollIntoView({ block: 'nearest' })
  },
  { flush: 'post' },
)

/** Applies a chosen service to the order form and syncs the Category dropdown. */
function setService(service: Service): void {
  selected.value = service
  categoryId.value = serviceCategoryId(service)
  // Keep the Category field label in sync with the picked service.
  categorySearch.value = store.categories.find((c) => c._id === categoryId.value)?.name ?? ''
  // If the picked service's category is not part of the active platform chip,
  // the Category dropdown would land on an invisible value — deactivate the
  // chip so the selection always stays consistent with the filtered list.
  // (Only evaluated when the service actually resolves to a real category id.)
  if (
    platform.value &&
    categoryId.value &&
    !categoryOptions.value.some((o) => o.value === categoryId.value)
  ) {
    platform.value = ''
  }
  clearOrder()
}

/** Clears the chosen service from the read-only Service field (the × button). */
function clearService(): void {
  selected.value = null
  trigger.value = ''
  clearOrder()
  panelOpen.value = false
  panelIndex.value = -1
}

function selectService(service: Service): void {
  setService(service)
  panelOpen.value = false
  panelIndex.value = -1
  trigger.value = service.name
}

/** Picked from the search autocomplete — fills the box and auto-sets the category. */
function selectServiceFromSearch(service: Service): void {
  setService(service)
  search.value = service.name
  trigger.value = service.name
  closeSearch()
  panelOpen.value = false
  panelIndex.value = -1
}

/** True when a category group's rows are hidden in the dropdown. */
function isGroupCollapsed(label: string): boolean {
  return collapsedGroups.value.has(label)
}

/** Toggles a category group between expanded and collapsed. */
function toggleGroup(label: string): void {
  const next = new Set(collapsedGroups.value)
  if (next.has(label)) next.delete(label)
  else next.add(label)
  collapsedGroups.value = next
}

/** Opens the service dropdown (trigger's focus/click event). */
function openServicePanel(): void {
  panelOpen.value = true
  panelIndex.value = -1
  closeSearch()
  closeCategory()
  void loadAllServices()
  // Keep the chosen service visible: expand its group if it was collapsed.
  if (selected.value) {
    const label = categoryLabel(selected.value)
    if (collapsedGroups.value.has(label)) {
      const next = new Set(collapsedGroups.value)
      next.delete(label)
      collapsedGroups.value = next
    }
  }
}

/** Toggles the service dropdown from its chevron button — click again to hide.
 *  Opening also focuses the trigger so arrow-key/Enter navigation works
 *  immediately (the chevron's mousedown.prevent leaves focus where it was). */
function toggleServicePanel(): void {
  if (panelOpen.value) closePanel()
  else {
    openServicePanel()
    serviceTriggerEl.value?.focus()
  }
}

/** Closes the dropdown, restoring the selected service's name in the trigger. */
function closePanel(): void {
  panelOpen.value = false
  panelIndex.value = -1
  trigger.value = selected.value?.name ?? ''
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
// Only rows tagged [data-service-row] count (group headers are buttons too).
watch(
  panelIndex,
  (index) => {
    if (index < 0) return
    panelListEl.value
      ?.querySelectorAll('button[data-service-row]')
      [index]?.scrollIntoView({ block: 'nearest' })
  },
  { flush: 'post' },
)

// Clearing the Service field deselects the service — the Service details and
// Order details sections disappear (the dropdown stays open to pick again).
watch(trigger, (value) => {
  if (!value.trim() && selected.value) {
    selected.value = null
    clearOrder()
  }
})

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
 * Reads ?category=… from the route (set by the Favourites tab) and sets the
 * browse filter to that category — the Service field stays empty so the user
 * picks a service for the favourited category, exactly like a manual pick.
 */
async function applyCategoryQuery(): Promise<void> {
  const q = route.query
  const category = typeof q.category === 'string' ? q.category : ''
  if (!category) return
  // Categories resolve asynchronously — only act once the id matches a real
  // category in the loaded catalogue.
  const cat = store.categories.find((c) => c._id === category)
  if (!cat) return
  platform.value = ''
  categoryId.value = cat._id
  changeCategory()
  categorySearch.value = cat.name
}

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
      platformChips.value.some((c) => c.key === detected)
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
  // Gate the prefill on ONLY the fast requests it truly needs (categories +
  // the first browse page). The full-catalogue pagination runs in parallel
  // but must never delay the pre-filled order form — that is what made
  // favourite/order-again navigation feel slow.
  const categoriesPromise = store.fetchCategories()
  const browsePromise = loadServices()
  const fullLoad = Promise.allSettled([
    categoriesPromise,
    browsePromise,
    walletStore.fetchWallet(),
    favoritesStore.fetch(),
    loadAllServices(),
  ])

  // Only show the loader when there is actually something to prefill — a
  // plain Explore visit must not flash it.
  const hasPrefill =
    typeof route.query.serviceId === 'string' || typeof route.query.category === 'string'
  if (hasPrefill) prefillPending.value = true

  await Promise.all([categoriesPromise, browsePromise])
  await applyCategoryQuery()
  await applyPrefill()
  prefillPending.value = false

  await fullLoad
})
</script>

<template>
  <div class="w-full">
    <!-- Indeterminate progress bar while a prefill (favourite / order again)
         is being applied — instant visual feedback on arrival. -->
    <div
      v-if="prefillPending"
      class="pointer-events-none fixed inset-x-0 top-0 z-[60] h-1 overflow-hidden bg-ink/5"
      aria-hidden="true"
    >
      <div class="prefill-bar h-full w-1/3 rounded-full bg-gradient-to-r from-brand-500 via-secondary-500 to-brand-500" />
    </div>

    <!-- Everything on one screen: Find your service → Service details → Order
         details — in a centered 70% column so the page stays readable. -->
    <div class="mx-auto w-full space-y-6 lg:w-[70%] xl:max-w-[1400px]">
    <!-- Header -->
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="font-display text-xl font-bold text-ink">Explore Services</h1>
      </div>

      <!-- Platform quick filters — the five platforms plus Facebook Live
           (replaces the wallet balance card). 3-column × 2-row grid on
           phones, a single wrapping row on larger screens. -->
      <div
        class="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-end"
      >
        <button
          v-for="chip in platformChips"
          :key="chip.key"
          type="button"
          :data-platform-chip="chip.key"
          :data-live-chip="chip.key === LIVE_PLATFORM ? '' : undefined"
          class="flex min-w-0 items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-xs font-semibold transition-all active:scale-95 sm:justify-start sm:gap-2 sm:px-3 sm:py-2 sm:text-sm"
          :class="
            platform === chip.key
              ? 'border-brand-400/60 bg-brand-500/15 text-ink ring-1 ring-brand-400/40'
              : 'border-ink/10 bg-ink/5 text-ink/60 hover:border-brand-400/40 hover:text-ink'
          "
          :aria-pressed="platform === chip.key"
          @click="selectPlatform(chip.key)"
        >
          <PlatformIcon :platform="chip.icon" size="xs" tile />
          <span class="truncate text-xs sm:text-sm">{{ chip.label }}</span>
        </button>
      </div>
    </div>

    <!-- Step 1 — Find your service (full width). The card's .glass
         backdrop-filter creates its own stacking context; when a dropdown is
         open we elevate the whole card so its panel paints above the order
         form that follows it in the DOM. -->
    <div
      class="glass rounded-2xl p-5 shadow-card sm:p-7 transition-shadow"
      :class="panelOpen || searchOpen || categoryOpen ? 'relative z-50 shadow-glow' : ''"
    >
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
            placeholder="Search all services… e.g. Facebook Live Stream"
            class="relative z-20 h-9.5 w-full rounded-lg border border-ink/10 bg-ink/5 pl-9 pr-3.5 text-sm text-ink placeholder:text-ink/30 transition-colors focus:border-brand-400/60 focus:outline-none focus:ring-2 focus:ring-brand-400/30"
            @focus="searchOpen = true; closePanel(); closeCategory(); highlightedIndex = -1"
            @input="onSearchInput"
            @keydown="onSearchKeydown"
            @keydown.esc="closeSearch"
          />

          <!-- Click-away overlay for the search dropdown -->
          <div v-if="searchOpen" class="fixed inset-0 z-10" @click="closeSearch" />

          <!-- Live results dropdown: click a result to auto-pick it + its category -->
          <Transition name="drop">
            <div
              v-if="searchOpen && search.trim()"
              class="absolute z-40 mt-2 w-full overflow-hidden rounded-2xl border border-ink/10 bg-card/95 shadow-glow backdrop-blur-xl"
            >
              <div ref="searchListEl" class="max-h-80 overflow-y-auto p-1.5">
                <!-- Matching services (click to auto-pick + auto-set category) —
                     a clean flat list, no platform icons and no category rows. -->
                <template v-if="searchDropdownResults.length">
                  <div
                    v-for="(s, index) in searchDropdownResults"
                    :key="s._id"
                    class="flex items-center gap-1 rounded-xl transition-colors"
                    :class="
                      index === highlightedIndex
                        ? 'bg-ink/10 ring-1 ring-brand-400/40'
                        : 'hover:bg-ink/5'
                    "
                  >
                    <button
                      type="button"
                      data-search-service
                      class="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left"
                      @mousedown.prevent
                      @click="selectServiceFromSearch(s)"
                    >
                      <span class="min-w-0">
                        <span class="block text-sm font-medium text-ink break-words leading-snug">
                          <span
                            v-if="s.providerServiceId"
                            class="mr-1.5 inline-flex items-center rounded-md bg-brand-500/20 px-1.5 py-0.5 font-mono text-[11px] font-bold text-brand-300 align-baseline shrink-0"
                          >
                            {{ s.providerServiceId }}
                          </span>
                          <span>{{ s.name }}</span>
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
                    <button
                      type="button"
                      :data-fav-service="s._id"
                      :data-favorited="favoritesStore.isServiceFavorite(s._id) ? 'true' : 'false'"
                      :aria-label="
                        favoritesStore.isServiceFavorite(s._id)
                          ? `Remove ${s.name} from favourites`
                          : `Add ${s.name} to favourites`
                      "
                      :title="
                        favoritesStore.isServiceFavorite(s._id)
                          ? 'Remove from favourites'
                          : 'Add to favourites'
                      "
                      class="mr-1.5 shrink-0 rounded-lg p-2 text-ink/30 transition-all hover:bg-amber-400/10 hover:text-amber-400 active:scale-90"
                      @mousedown.prevent
                      @click.stop="toggleServiceFavorite(s._id)"
                    >
                      <Star
                        class="h-4 w-4"
                        :class="
                          favoritesStore.isServiceFavorite(s._id)
                            ? 'fill-amber-400 text-amber-400'
                            : ''
                        "
                      />
                    </button>
                  </div>
                </template>

                <p
                  v-if="searchDropdownServices.length === 0"
                  class="px-3 py-6 text-center text-sm text-ink/40"
                >
                  No results found for “{{ search.trim() }}”.
                  <span class="mt-1 block text-xs text-ink/30">
                    Try a keyword like “facebook”, “tiktok”, “live”, “views” or “followers”.
                  </span>
                </p>
              </div>
            </div>
          </Transition>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <!-- Category — searchable combobox: type to filter, click or Enter to select -->
          <div class="block">
            <span class="mb-1.5 block text-sm font-medium text-ink/80">Category</span>
            <div class="relative">
              <Search
                class="pointer-events-none absolute left-3.5 top-1/2 z-30 h-4 w-4 -translate-y-1/2 text-ink/35"
              />
              <input
                ref="categoryTriggerEl"
                v-model="categorySearch"
                type="text"
                role="combobox"
                :aria-expanded="categoryOpen"
                placeholder="Search or select a category…"
                autocomplete="off"
                spellcheck="false"
                class="relative z-30 h-9.5 w-full rounded-lg border border-ink/10 bg-ink/5 pl-9 pr-9 text-sm text-ink placeholder:text-ink/30 transition-colors focus:border-brand-400/60 focus:outline-none focus:ring-2 focus:ring-brand-400/30"
                @focus="openCategoryPanel"
                @click="onCategoryFieldClick"
                @input="onCategoryInput"
                @keydown="onCategoryKeydown"
                @keydown.esc="closeCategory"
                @blur="closeCategory"
              />
              <button
                type="button"
                aria-label="Toggle category list"
                class="absolute right-2.5 top-1/2 z-30 -translate-y-1/2 rounded-lg p-1.5 text-ink/40 transition-colors hover:bg-ink/5 hover:text-ink"
                @mousedown.prevent
                @click="toggleCategoryPanel"
              >
                <ChevronDown
                  class="h-4 w-4 transition-transform duration-150"
                  :class="categoryOpen ? 'rotate-180' : ''"
                />
              </button>

              <!-- Click-away overlay -->
              <div v-if="categoryOpen" class="fixed inset-0 z-20" @click="closeCategory" />

              <Transition name="drop">
                <div
                  v-if="categoryOpen"
                  class="absolute z-40 mt-2 w-full overflow-hidden rounded-2xl border border-ink/10 bg-card/95 shadow-glow backdrop-blur-xl"
                >
                  <!-- Favourites filter: narrows the list to starred categories.
                       Sits OUTSIDE the scroll container so keyboard-highlight
                       indices stay aligned with the visible rows below. -->
                  <div class="flex items-center justify-between gap-2 border-b border-ink/10 px-3 py-2">
                    <span class="text-[10px] font-semibold uppercase tracking-wider text-ink/35">
                      Favourites
                    </span>
                    <button
                      type="button"
                      data-fav-filter
                      :aria-pressed="favFilter"
                      :title="favFilter ? 'Show all categories' : 'Show favourited categories only'"
                      class="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all active:scale-95"
                      :class="
                        favFilter
                          ? 'bg-amber-400/15 text-amber-500 ring-1 ring-amber-400/40'
                          : 'bg-ink/5 text-ink/40 hover:bg-amber-400/10 hover:text-ink'
                      "
                      @mousedown.prevent
                      @click="toggleFavFilter"
                    >
                      <Star
                        class="h-3.5 w-3.5"
                        :class="favFilter ? 'fill-amber-400 text-amber-400' : ''"
                      />
                      {{ favFilter ? 'Showing favourites only' : 'Show favourites only' }}
                      <span
                        v-if="favoritesStore.ids.length > 0"
                        class="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                        :class="
                          favFilter ? 'bg-amber-400/20 text-amber-500' : 'bg-ink/10 text-ink/50'
                        "
                      >
                        {{ favoritesStore.ids.length }}
                      </span>
                    </button>
                  </div>
                  <div ref="categoryListEl" class="max-h-64 overflow-y-auto p-1.5">
                    <!-- Each row: the select button (tap to filter) plus a star
                         button (tap to favourite the category). The star sits
                         outside the select button so clicks never nest. -->
                    <div
                      v-for="(row, index) in categoryRows"
                      :key="row.value"
                      class="flex items-center gap-1 rounded-xl transition-colors"
                      :class="
                        categoryId === row.value ? 'bg-brand-500/15' : 'hover:bg-ink/5'
                      "
                    >
                      <button
                        type="button"
                        :data-category-option="row.label"
                        class="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-3 py-2.5 text-left"
                        :class="
                          index === categoryIndex
                            ? 'bg-ink/10 ring-1 ring-brand-400/40'
                            : ''
                        "
                        @mousedown.prevent
                        @click="selectCategoryRow(row)"
                      >
                        <Check
                          v-if="categoryId === row.value"
                          class="h-3.5 w-3.5 shrink-0 text-brand-300"
                        />
                        <span class="min-w-0">
                          <span class="block truncate text-sm font-medium text-ink">{{ row.label }}</span>
                        </span>
                      </button>
                      <button
                        v-if="row.value"
                        type="button"
                        :data-fav-category="row.value"
                        :data-favorited="favoritesStore.isFavorite(row.value) ? 'true' : 'false'"
                        :aria-label="
                          favoritesStore.isFavorite(row.value)
                            ? `Remove ${row.label} from favourites`
                            : `Add ${row.label} to favourites`
                        "
                        :title="
                          favoritesStore.isFavorite(row.value)
                            ? 'Remove from favourites'
                            : 'Add to favourites'
                        "
                        class="mr-1.5 shrink-0 rounded-lg p-2 text-ink/30 transition-all hover:bg-amber-400/10 hover:text-amber-400 active:scale-90"
                        @mousedown.prevent
                        @click.stop="toggleFavorite(row.value)"
                      >
                        <Star
                          class="h-4 w-4"
                          :class="
                            favoritesStore.isFavorite(row.value)
                              ? 'fill-amber-400 text-amber-400'
                              : ''
                          "
                        />
                      </button>
                    </div>

                    <p
                      v-if="favFilter && favoritesStore.ids.length === 0"
                      class="px-3 py-6 text-center text-sm text-ink/40"
                    >
                      No favourites yet — tap the
                      <Star class="mx-1 inline h-3.5 w-3.5 -translate-y-px text-amber-400" />
                      star on a category to save it here.
                    </p>
                    <p
                      v-else-if="
                        favFilter ? categoryRows.length === 0 : categoryRows.length === 1
                      "
                      class="px-3 py-6 text-center text-sm text-ink/40"
                    >
                      No categories match “{{ categorySearch.trim() }}”.
                    </p>
                  </div>
                </div>
              </Transition>
            </div>
          </div>

          <!-- Service — read-only trigger: click opens the grouped catalogue -->
          <div class="block">
            <span class="mb-1.5 block text-sm font-medium text-ink/80">Service</span>
            <div class="relative">
              <Search
                class="pointer-events-none absolute left-3.5 top-1/2 z-30 h-4 w-4 -translate-y-1/2 text-ink/35"
              />
              <input
                ref="serviceTriggerEl"
                v-model="trigger"
                type="text"
                role="combobox"
                readonly
                :title="trigger"
                :aria-expanded="panelOpen"
                placeholder="Select a service…"
                class="relative z-30 h-9.5 w-full cursor-pointer rounded-lg border border-ink/10 bg-ink/5 pl-9 text-sm text-ink placeholder:text-ink/30 transition-colors focus:border-brand-400/60 focus:outline-none focus:ring-2 focus:ring-brand-400/30"
                :class="selected ? 'pr-16' : 'pr-10'"
                @focus="openServicePanel"
                @click="openServicePanel"
                @keydown="onPanelKeydown"
                @keydown.esc="closePanel"
                @blur="closePanel"
              />
              <button
                v-if="selected"
                type="button"
                aria-label="Clear service"
                class="absolute right-9 top-1/2 z-30 -translate-y-1/2 rounded-full p-1 text-ink/40 transition-colors hover:bg-ink/10 hover:text-ink"
                @mousedown.prevent
                @click="clearService"
              >
                <XCircle class="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Toggle service list"
                class="absolute right-2.5 top-1/2 z-30 -translate-y-1/2 rounded-lg p-1 text-ink/40 transition-colors hover:bg-ink/5 hover:text-ink"
                @mousedown.prevent
                @click="toggleServicePanel"
              >
                <ChevronDown
                  class="h-4 w-4 transition-transform duration-150"
                  :class="panelOpen ? 'rotate-180' : ''"
                />
              </button>

              <!-- Click-away overlay -->
              <div v-if="panelOpen" class="fixed inset-0 z-20" @click="closePanel" />

              <Transition name="drop">                <div v-if="panelOpen"
                  class="absolute z-40 mt-2 w-full overflow-hidden rounded-2xl border border-ink/10 bg-card/95 shadow-glow backdrop-blur-xl"
                >
                  <div ref="panelListEl" class="max-h-96 overflow-y-auto p-1.5">
                    <!-- Sectioned by category: each category is its own
                         collapsible group, like a real SMM panel. Clicking a
                         header expands/collapses its services; the active
                         category leads but the list is never caged. -->
                    <template v-for="(group, gi) in panelGroups" :key="gi">
                      <button
                        v-if="group.label"
                        type="button"
                        :data-group-label="group.label"
                        :aria-expanded="!isGroupCollapsed(group.label)"
                        class="sticky top-0 z-10 flex w-full items-center justify-between gap-2 bg-card/95 px-3 pb-1 pt-2 text-left text-[10px] font-semibold uppercase tracking-wider text-ink/35 backdrop-blur transition-colors hover:text-ink/60"
                        @mousedown.prevent
                        @click="toggleGroup(group.label)"
                      >
                        <span class="flex min-w-0 items-center gap-1.5">
                          <ChevronDown
                            class="h-3 w-3 shrink-0 text-ink/40 transition-transform duration-200"
                            :class="isGroupCollapsed(group.label) ? '-rotate-90' : ''"
                          />
                          <span class="truncate">{{ group.label }}</span>
                          <span class="ml-0.5 shrink-0 font-normal text-ink/25">{{ group.items.length }}</span>
                        </span>
                      </button>
                      <template v-if="!isGroupCollapsed(group.label)">
                        <div
                          v-for="s in group.items"
                          :key="s._id"
                          class="flex items-center gap-1 rounded-xl transition-colors"
                          :class="
                            selected?._id === s._id
                              ? 'bg-brand-500/15'
                              : panelIndexById.get(s._id) === panelIndex
                                ? 'bg-ink/10 ring-1 ring-brand-400/40'
                                : 'hover:bg-ink/5'
                          "
                        >
                        <button
                          type="button"
                          data-service-row
                          class="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left"
                          @mousedown.prevent
                          @click="selectService(s)"
                        >
                        <span class="min-w-0">
                          <span class="block text-sm font-medium text-ink break-words leading-snug">
                            <Check
                              v-if="selected?._id === s._id"
                              class="mr-1.5 inline h-3.5 w-3.5 text-brand-300 shrink-0"
                            />
                            <span
                              v-if="s.providerServiceId"
                              class="mr-1.5 inline-flex items-center rounded-md bg-brand-500/20 px-1.5 py-0.5 font-mono text-[11px] font-bold text-brand-300 align-baseline shrink-0"
                            >
                              {{ s.providerServiceId }}
                            </span>
                            <span>{{ s.name }}</span>
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
                      <button
                        type="button"
                        :data-fav-service="s._id"
                        :data-favorited="favoritesStore.isServiceFavorite(s._id) ? 'true' : 'false'"
                        :aria-label="
                          favoritesStore.isServiceFavorite(s._id)
                            ? `Remove ${s.name} from favourites`
                            : `Add ${s.name} to favourites`
                        "
                        :title="
                          favoritesStore.isServiceFavorite(s._id)
                            ? 'Remove from favourites'
                            : 'Add to favourites'
                        "
                        class="mr-1.5 shrink-0 rounded-lg p-2 text-ink/30 transition-all hover:bg-amber-400/10 hover:text-amber-400 active:scale-90"
                        @mousedown.prevent
                        @click.stop="toggleServiceFavorite(s._id)"
                      >
                        <Star
                          class="h-4 w-4"
                          :class="
                            favoritesStore.isServiceFavorite(s._id)
                              ? 'fill-amber-400 text-amber-400'
                              : ''
                          "
                        />
                      </button>
                      </div>
                      </template>
                    </template>

                    <p
                      v-if="!loading && panelEmpty"
                      class="px-3 py-6 text-center text-sm text-ink/40"
                    >
                      No services match — try a different search or category.
                    </p>
                    <p v-else-if="loading && panelEmpty" class="space-y-2 px-3 py-4">
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
            {{ (search.trim() ? searchDropdownServices.length : services.length).toLocaleString() }} result{{
              (search.trim() ? searchDropdownServices.length : services.length) === 1 ? '' : 's'
            }}
          </span>
          <button
            v-if="loadError"
            class="inline-flex items-center gap-1 font-medium text-brand-300 hover:text-brand-200"
            @click="loadServices()"
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
    <!-- The dashboard topbar is a single 64px bar (no promo marquee) — keep
         the prefill scroll target clear of it. -->
    <div v-if="selected" data-order-form class="w-full scroll-mt-20">
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
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div class="flex min-w-0 items-start gap-3">
                  <PlatformIcon :platform="servicePlatform" size="md" tile class="mt-0.5 shrink-0" />
                  <div class="min-w-0 flex-1">
                    <h3 class="font-display text-base font-semibold text-ink break-words leading-snug">
                      {{ selected.name }}
                    </h3>
                    <p class="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink/45">
                      {{ serviceTypeLabel }}
                      <span
                        v-if="serviceId(selected)"
                        class="rounded-md bg-ink/5 px-1.5 py-0.5 font-mono text-[11px] font-medium text-ink/50"
                      >
                        ID {{ serviceId(selected) }}
                      </span>
                    </p>
                  </div>
                </div>
                <div class="flex shrink-0 items-center justify-between sm:justify-end gap-2 pt-1 sm:pt-0">
                  <button
                    type="button"
                    :data-fav-selected-service="selected._id"
                    :data-favorited="favoritesStore.isServiceFavorite(selected._id) ? 'true' : 'false'"
                    :aria-label="
                      favoritesStore.isServiceFavorite(selected._id)
                        ? `Remove ${selected.name} from favourites`
                        : `Add ${selected.name} to favourites`
                    "
                    :title="
                      favoritesStore.isServiceFavorite(selected._id)
                        ? 'Remove from favourites'
                        : 'Add to favourites'
                    "
                    class="shrink-0 rounded-xl p-2 text-ink/35 transition-all hover:bg-amber-400/10 hover:text-amber-400 active:scale-90"
                    @click.stop="toggleServiceFavorite(selected._id)"
                  >
                    <Star
                      class="h-5 w-5"
                      :class="
                        favoritesStore.isServiceFavorite(selected._id)
                          ? 'fill-amber-400 text-amber-400'
                          : ''
                      "
                    />
                  </button>
                  <span class="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">
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
              placeholder=""
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
                class="flex h-9.5 w-9.5 shrink-0 items-center justify-center rounded-lg border border-ink/10 bg-ink/5 text-ink/70 transition-all hover:border-brand-400/50 hover:text-ink active:scale-95 disabled:opacity-30"
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
                class="flex h-9.5 w-9.5 shrink-0 items-center justify-center rounded-lg border border-ink/10 bg-ink/5 text-ink/70 transition-all hover:border-brand-400/50 hover:text-ink active:scale-95 disabled:opacity-30"
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
              <p class="mt-0.5 font-display text-2xl font-bold text-ink">
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

    <!-- Loading wait animation while the prefill is being applied -->
    <div
      v-else-if="prefillPending"
      data-prefill-loading
      class="flex w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-ink/10 px-6 py-16 text-center"
    >
      <BaseSpinner class="h-8 w-8 text-brand-300" />
      <p class="text-sm font-medium text-ink/60">Preparing your order…</p>
      <p class="text-xs text-ink/35">Filling in your service and order details</p>
    </div>

    <!-- Empty state before any service is picked -->
    <div
      v-else
      class="flex w-full flex-col items-center justify-center rounded-2xl border border-dashed border-ink/10 px-6 py-16 text-center"
    >
      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-ink/5 text-ink/30">
        <Search class="h-6 w-6" />
      </div>
      <p class="mt-3 text-sm text-ink/40">Pick a service above to get started.</p>
    </div>
    </div>
  </div>
</template>

<style scoped>
/* Ultra-fast, smooth dropdown open/close — instant feel, zero lag. */
.drop-enter-active,
.drop-leave-active {
  transition: opacity 0.07s ease-out, transform 0.07s ease-out;
}
.drop-enter-from,
.drop-leave-to {
  opacity: 0;
  transform: translateY(-3px);
}

/* Indeterminate top progress bar shown while a prefill is being applied. */
.prefill-bar {
  animation: prefill-slide 1.1s ease-in-out infinite;
}
@keyframes prefill-slide {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(400%);
  }
}
</style>
