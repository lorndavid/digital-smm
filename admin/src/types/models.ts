// Admin-facing domain types (subset of the backend models).

export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  limit: number
}

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
}

export type ServiceType =
  | 'Default'
  | 'Package'
  | 'SEO'
  | 'Custom Comments'
  | 'Mentions'
  | 'Mentions User Followers'
  | 'Custom Comments Package'
  | 'Comment Likes'
  | 'Poll'
  | 'Comment Replies'
  | 'Invites from Groups'
  | 'Subscriptions'
  | 'Web Traffic'

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
}

export interface AdminUser {
  _id: string
  clerkId: string
  email: string
  name: string
  avatarUrl: string
  role: 'customer' | 'admin' | 'super_admin'
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
}

export type ManagedRole = 'admin' | 'super_admin'

export interface UserWallet {
  balance: number
  totalTopUp?: number
  totalSpent?: number
}

/** Admin user detail: profile + embedded wallet summary. */
export interface UserDetail {
  user: AdminUser & { wallet?: UserWallet | null }
}

export interface AdminIdentity {
  id: string
  email: string
  name: string
  role: ManagedRole
}

/** A user managed via the Clerk Backend API (Admins & Roles page). */
export interface AdminAccount {
  id: string
  email: string
  name: string
  role: 'customer' | 'admin' | 'super_admin'
  createdAt: string
}

export interface AdminAuditLog {
  _id: string
  actorClerkId: string
  actorEmail: string
  action: 'admin.create' | 'admin.set_role' | 'admin.remove_role'
  targetClerkId: string | null
  targetEmail: string
  details: { role?: string; name?: string }
  createdAt: string
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

export interface Order {
  _id: string
  orderNumber: number
  providerOrderId: number | null
  user: AdminUser | string
  service: Service | string
  type: ServiceType
  link: string
  quantity: number
  totalPrice: number
  currency: string
  status: OrderStatus
  startCount: number
  remains: number
  charge: number
  createdAt: string
  updatedAt: string
}

export type PaymentStatus = 'pending' | 'scanned' | 'paid' | 'expired' | 'failed' | 'refunded'
export type PaymentPurpose = 'topup' | 'order'

export interface Payment {
  _id: string
  user: AdminUser | string
  order:
    | {
        _id: string
        orderNumber?: number
        service?: { _id: string; name?: string } | string
      }
    | string
    | null
  amount: number
  currency: string
  provider: string
  method: string
  purpose: PaymentPurpose
  status: PaymentStatus
  referenceId: string
  providerPaymentId: string
  createdAt: string
  approvedAt: string | null
}

export interface PaymentStats {
  todayRevenue: number
  todayCount: number
  counts: Record<string, number>
}

export type AnnouncementType = 'info' | 'success' | 'warning' | 'critical'

export interface Announcement {
  _id: string
  title: string
  body: string
  type: AnnouncementType
  isActive: boolean
  expiresAt: string | null
  createdAt: string
}

export interface Setting {
  _id: string
  key: string
  value: unknown
  description: string
}

export interface DashboardStats {
  users: { total: number; active: number }
  orders: { total: number; revenue: number }
  services: { total: number; active: number }
  categories: number
  paymentTotals: Record<string, { total: number; count: number }>
  statusBreakdown: Array<{ _id: string; count: number }>
  providerBalance: { balance: number; currency: string } | null
}

export interface SyncResult {
  provider: string
  created: number
  updated: number
  total: number
}
