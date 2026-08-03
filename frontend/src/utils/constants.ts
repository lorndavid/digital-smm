import type { OrderStatus, PaymentStatus, Platform, ServiceType } from '@/types/models'

export const STATUS_META: Record<OrderStatus, { label: string; className: string; dot: string }> = {
  'Pending Payment': {
    label: 'Pending payment',
    className: 'bg-amber-400/10 text-amber-300 ring-amber-400/30',
    dot: 'bg-amber-400',
  },
  Paid: {
    label: 'Paid',
    className: 'bg-sky-400/10 text-sky-300 ring-sky-400/30',
    dot: 'bg-sky-400',
  },
  Processing: {
    label: 'Processing',
    className: 'bg-amber-400/10 text-amber-300 ring-amber-400/30',
    dot: 'bg-amber-400',
  },
  'In progress': {
    label: 'In progress',
    className: 'bg-blue-400/10 text-blue-300 ring-blue-400/30',
    dot: 'bg-blue-400',
  },
  Partial: {
    label: 'Partial',
    className: 'bg-violet-400/10 text-violet-300 ring-violet-400/30',
    dot: 'bg-violet-400',
  },
  Completed: {
    label: 'Completed',
    className: 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/30',
    dot: 'bg-emerald-400',
  },
  Cancelled: {
    label: 'Cancelled',
    className: 'bg-rose-400/10 text-rose-300 ring-rose-400/30',
    dot: 'bg-rose-400',
  },
  Refunded: {
    label: 'Refunded',
    className: 'bg-slate-400/10 text-slate-300 ring-slate-400/30',
    dot: 'bg-slate-400',
  },
  Failed: {
    label: 'Failed',
    className: 'bg-red-400/10 text-red-300 ring-red-400/30',
    dot: 'bg-red-400',
  },
}

export const STATUS_TONE: Record<
  OrderStatus,
  'success' | 'warning' | 'danger' | 'info' | 'brand' | 'neutral'
> = {
  'Pending Payment': 'warning',
  Paid: 'info',
  Processing: 'warning',
  'In progress': 'info',
  Partial: 'brand',
  Completed: 'success',
  Cancelled: 'danger',
  Refunded: 'neutral',
  Failed: 'danger',
}

export type PaymentTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

export const PAYMENT_STATUS_META: Record<PaymentStatus, { label: string; tone: PaymentTone }> = {
  pending: { label: 'Pending', tone: 'warning' },
  scanned: { label: 'Scanned', tone: 'info' },
  paid: { label: 'Paid', tone: 'success' },
  expired: { label: 'Expired', tone: 'neutral' },
  failed: { label: 'Failed', tone: 'danger' },
  refunded: { label: 'Refunded', tone: 'neutral' },
}

export const PAYMENT_PURPOSE_LABEL: Record<string, string> = {
  topup: 'Wallet top-up',
  order: 'Service order',
}

export const SERVICE_TYPE_LABEL: Record<ServiceType, string> = {
  Default: 'Standard',
  Package: 'Package',
  SEO: 'SEO',
  'Custom Comments': 'Custom Comments',
  Mentions: 'Mentions',
  'Mentions User Followers': 'Mentions · Followers',
  'Custom Comments Package': 'Comments Package',
  'Comment Likes': 'Comment Likes',
  Poll: 'Poll Votes',
  'Comment Replies': 'Comment Replies',
  'Invites from Groups': 'Group Invites',
  Subscriptions: 'Subscription',
  'Web Traffic': 'Web Traffic',
}

export const PLATFORM_META: Record<Platform, { label: string; color: string; ring: string }> = {
  tiktok: {
    label: 'TikTok',
    color: 'from-fuchsia-500/25 to-cyan-400/25',
    ring: 'ring-fuchsia-400/40',
  },
  facebook: {
    label: 'Facebook',
    color: 'from-blue-500/25 to-indigo-400/25',
    ring: 'ring-blue-400/40',
  },
  instagram: {
    label: 'Instagram',
    color: 'from-pink-500/25 to-amber-400/25',
    ring: 'ring-pink-400/40',
  },
  youtube: {
    label: 'YouTube',
    color: 'from-red-500/25 to-rose-400/25',
    ring: 'ring-red-400/40',
  },
  telegram: {
    label: 'Telegram',
    color: 'from-sky-400/25 to-blue-500/25',
    ring: 'ring-sky-400/40',
  },
  other: {
    label: 'Other',
    color: 'from-slate-500/25 to-slate-400/25',
    ring: 'ring-slate-400/40',
  },
}

export const ANNOUNCEMENT_STYLES: Record<string, string> = {
  info: 'border-sky-400/30 bg-sky-400/10 text-sky-200',
  success: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  warning: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
  critical: 'border-rose-400/30 bg-rose-400/10 text-rose-200',
}
