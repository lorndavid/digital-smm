import type { OrderStatus } from '@/types/models'

export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'brand' | 'neutral'

export const STATUS_TONE: Record<OrderStatus, BadgeTone> = {
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

export const SERVICE_TYPES = [
  'Default',
  'Package',
  'SEO',
  'Custom Comments',
  'Mentions',
  'Mentions User Followers',
  'Custom Comments Package',
  'Comment Likes',
  'Poll',
  'Comment Replies',
  'Invites from Groups',
  'Subscriptions',
  'Web Traffic',
] as const

export const PLATFORMS = [
  { value: 'tiktok', label: 'TikTok' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'other', label: 'Other' },
] as const

export const STATUS_LABEL: Record<OrderStatus, string> = {
  'Pending Payment': 'Pending payment',
  Paid: 'Paid',
  Processing: 'Processing',
  'In progress': 'In progress',
  Partial: 'Partial',
  Completed: 'Completed',
  Cancelled: 'Cancelled',
  Refunded: 'Refunded',
  Failed: 'Failed',
}

export const PAYMENT_TONE: Record<string, BadgeTone> = {
  pending: 'warning',
  scanned: 'info',
  paid: 'success',
  expired: 'neutral',
  failed: 'danger',
  refunded: 'neutral',
}
