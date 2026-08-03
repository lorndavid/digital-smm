export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}

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

export function formatNumber(value: number | string | null | undefined): string {
  const num = typeof value === 'string' ? Number(value) : (value ?? 0)
  if (!Number.isFinite(num)) return '—'
  return new Intl.NumberFormat('en-US').format(num)
}

export function formatCompact(value: number | string | null | undefined): string {
  const num = typeof value === 'string' ? Number(value) : (value ?? 0)
  if (!Number.isFinite(num)) return '—'
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(num)
}

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

export function formatRelative(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const date = typeof value === 'string' ? new Date(value) : value
  const minutes = Math.floor((Date.now() - date.getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return formatDate(date)
}

export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}
