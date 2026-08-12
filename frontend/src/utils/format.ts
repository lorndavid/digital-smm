/** Joins conditional class names, filtering falsy values. */
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}

/** Formats a number as USD money. */
export function formatMoney(value: number | string | null | undefined, currency = 'USD'): string {
  const num = typeof value === 'string' ? Number(value) : (value ?? 0)
  if (!Number.isFinite(num)) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

/** Formats a number with thousand separators. */
export function formatNumber(value: number | string | null | undefined): string {
  const num = typeof value === 'string' ? Number(value) : (value ?? 0)
  if (!Number.isFinite(num)) return '—'
  return new Intl.NumberFormat('en-US').format(num)
}

/** Compact number format for large stats (1.2M, 45K). */
export function formatCompact(value: number | string | null | undefined): string {
  const num = typeof value === 'string' ? Number(value) : (value ?? 0)
  if (!Number.isFinite(num)) return '—'
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(num)
}

/** Formats an ISO date/time string as a readable local datetime. */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

/** Returns a short relative time label (e.g. "2h ago"). */
export function formatRelative(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const date = typeof value === 'string' ? new Date(value) : value
  const diff = Date.now() - date.getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return formatDate(date)
}

/** Formats a per-1,000 rate with adaptive precision (e.g. $0.84 or $0.0013). */
export function formatUnitPrice(value: number | string | null | undefined, currency = 'USD'): string {
  const num = typeof value === 'string' ? Number(value) : (value ?? 0)
  if (!Number.isFinite(num)) return '—'
  const maxFractionDigits = num >= 1 ? 2 : num >= 0.01 ? 3 : 5
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: maxFractionDigits,
  }).format(num)
}

/** Clamps a number into [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** Formats a provider (SMMWiz) service id as a compact '#12345' tag — empty
 *  when the service has no provider id (e.g. locally created services). */
export function formatServiceId(value: number | null | undefined): string {
  return value ? `#${value}` : ''
}

/**
 * Null-safe service display name for an order. The order's `service` ref can
 * be `null` when the underlying service was removed from the catalogue (e.g.
 * provider re-sync) — `typeof null === 'object'` makes naive guards crash on
 * `.name`. Falls back to a neutral label.
 */
export function orderServiceName(
  service: { name?: string } | string | null | undefined,
  fallback = 'Service',
): string {
  return service && typeof service === 'object' && service.name ? service.name : fallback
}
