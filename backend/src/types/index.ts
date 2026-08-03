/**
 * Shared domain types for the VidSMM backend.
 */

/** The order/service types supported by the SMM provider API. */
export enum ServiceType {
  Default = 'Default',
  Package = 'Package',
  SEO = 'SEO',
  CustomComments = 'Custom Comments',
  Mentions = 'Mentions',
  MentionsUserFollowers = 'Mentions User Followers',
  CustomCommentsPackage = 'Custom Comments Package',
  CommentLikes = 'Comment Likes',
  Poll = 'Poll',
  CommentReplies = 'Comment Replies',
  InvitesFromGroups = 'Invites from Groups',
  Subscriptions = 'Subscriptions',
  WebTraffic = 'Web Traffic',
}

export const ORDER_STATUSES = [
  'Pending Payment',
  'Paid',
  'Processing',
  'In progress',
  'Partial',
  'Completed',
  'Cancelled',
  'Refunded',
  'Failed',
] as const

export type OrderStatus = (typeof ORDER_STATUSES)[number]

export const PAYMENT_STATUSES = [
  'pending',
  'scanned',
  'paid',
  'expired',
  'failed',
  'refunded',
] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

export const PAYMENT_PROVIDERS = [
  'mock',
  'cutluy',
  'abapayway',
  'bakong',
  'acleda',
  'wing',
] as const
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number]

export const PAYMENT_PURPOSES = ['topup', 'order'] as const
export type PaymentPurpose = (typeof PAYMENT_PURPOSES)[number]

export const WALLET_TRANSACTION_TYPES = ['credit', 'debit'] as const
export type WalletTransactionType = (typeof WALLET_TRANSACTION_TYPES)[number]

export const ANNOUNCEMENT_TYPES = ['info', 'success', 'warning', 'critical'] as const
export type AnnouncementType = (typeof ANNOUNCEMENT_TYPES)[number]

export const USER_ROLES = ['customer', 'admin', 'super_admin'] as const
export type UserRole = (typeof USER_ROLES)[number]

export const PLATFORMS = ['tiktok', 'facebook', 'instagram', 'youtube', 'telegram', 'other'] as const
export type Platform = (typeof PLATFORMS)[number]
