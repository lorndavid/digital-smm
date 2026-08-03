// ---------------------------------------------------------------------------
// Domain models — keep in sync with backend/src/models and backend/src/types
// ---------------------------------------------------------------------------

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

export type ServiceType = (typeof SERVICE_TYPES)[number]

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

export const ANNOUNCEMENT_TYPES = ['info', 'success', 'warning', 'critical'] as const
export type AnnouncementType = (typeof ANNOUNCEMENT_TYPES)[number]

export type Platform = 'tiktok' | 'facebook' | 'instagram' | 'youtube' | 'telegram' | 'other'

export interface Category {
  _id: string
  name: string
  slug: string
  platform: Platform
  description: string
  icon: string
  sortOrder: number
  isActive: boolean
  createdAt?: string
}

export interface Service {
  _id: string
  providerServiceId: number | null
  name: string
  type: ServiceType
  category: Category | string | null
  description: string
  image: string
  pricePerUnit: number
  currency: string
  min: number
  max: number
  refill: boolean
  cancel: boolean
  deliveryTime: string
  provider: string
  isActive: boolean
  isFeatured: boolean
  sortOrder: number
  createdAt?: string
}

export interface Order {
  _id: string
  orderNumber: number
  providerOrderId: number | null
  user: string
  service: Service | string
  type: ServiceType
  link: string
  quantity: number
  pricePerUnit: number
  totalPrice: number
  currency: string
  params: Record<string, unknown>
  status: OrderStatus
  startCount: number
  remains: number
  charge: number
  payment: string | null
  error: string
  createdAt: string
  updatedAt: string
}

export interface Payment {
  _id: string
  user: string
  order: Order | string | null
  provider: PaymentProvider
  method: string
  purpose: PaymentPurpose
  status: PaymentStatus
  /** Our unique internal reference (used in /pay/:reference URLs). */
  referenceId: string
  /** Provider-side payment id. */
  providerPaymentId: string
  idempotencyKey: string
  amount: number
  currency: string
  /** Raw KHQR (EMV) payload. */
  qrString: string
  /** QR rendered as a data URL. */
  qrCodeDataUrl: string
  /** Hosted branded checkout page (CutLuy) or redirect URL (ABA). */
  checkoutUrl: string
  metadata: Record<string, unknown>
  approvedAt: string | null
  expiresAt: string | null
  createdAt: string
}

export interface WalletTransaction {
  _id?: string
  type: 'credit' | 'debit'
  amount: number
  description: string
  refType: 'topup' | 'order' | 'refund' | 'adjustment'
  refId: string | null
  balanceAfter: number
  createdAt?: string
}

export interface Wallet {
  _id: string
  user: string
  balance: number
  currency: string
  totalTopUp: number
  totalSpent: number
  transactions: WalletTransaction[]
}

export interface UserProfile {
  _id: string
  clerkId: string
  email: string
  name: string
  avatarUrl: string
  role: 'customer' | 'admin'
  isActive: boolean
  lastLoginAt: string | null
}

export interface Profile {
  user: UserProfile
  wallet: Wallet
}

export interface Announcement {
  _id: string
  title: string
  body: string
  type: AnnouncementType
  isActive: boolean
  expiresAt: string | null
  createdAt: string
}

export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  limit: number
}
