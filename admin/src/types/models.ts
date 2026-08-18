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
  /** Added by the admin categories endpoint (service counts). */
  serviceCount?: number
  activeServiceCount?: number
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
  providerRate?: number
  profitPercentage?: number
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
  /** External provider account id (Google `sub`). */
  providerId: string
  /** Identity provider ('google' | legacy 'clerk'). */
  provider?: string
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

/** An admin managed via MongoDB (Admins & Roles page). */
export interface AdminAccount {
  id: string
  email: string
  name: string
  role: 'customer' | 'admin' | 'super_admin'
  createdAt: string
}

export interface AdminAuditLog {
  _id: string
  actorId: string
  actorEmail: string
  action:
    | 'admin.create'
    | 'admin.set_role'
    | 'admin.remove_role'
    | 'admin.bulk_services'
    | 'admin.order_again'
  targetId: string | null
  targetEmail: string
  details: { role?: string; name?: string; orderNumber?: number }
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
  pricePerUnit: number
  totalPrice: number
  currency: string
  status: OrderStatus
  params?: Record<string, unknown>
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

export type AnalyticsRange =
  | 'today'
  | '7d'
  | '30d'
  | '90d'
  | 'this_month'
  | 'last_month'
  | 'custom'

export interface RevenueAnalytics {
  range: AnalyticsRange
  start: string
  end: string
  totalRevenue: number
  successfulPayments: number
  failedPayments: number
  refunds: number
  averageOrderValue: number
  byPurpose: Record<string, { total: number; count: number }>
}

export interface OverviewAnalytics {
  range: AnalyticsRange
  start: string
  end: string
  orders: number
  users: number
  paidOrders: number
  conversionRate: number
  ordersByStatus: Array<{ _id: string; count: number }>
}

export interface ServicesAnalytics {
  range: AnalyticsRange
  start: string
  end: string
  topServices: Array<{ serviceName: string; count: number; revenue: number }>
  byPlatform: Array<{ _id: string; orders: number; revenue: number }>
  totalServices: number
  totalCategories: number
}

/** Dependency status for the System Health page. */
export type DependencyStatus = 'ok' | 'down' | 'degraded' | 'not-configured'

export type IncidentSeverity = 'warning' | 'error' | 'critical'
export type IncidentStatus = 'open' | 'investigating' | 'resolved'

export interface Incident {
  id: string
  key: string
  severity: IncidentSeverity
  service: string
  title: string
  message: string
  status: IncidentStatus
  occurrences: number
  environment: string
  version: string
  firstSeenAt: string
  lastSeenAt: string
  resolvedAt: string | null
  resolutionReason: string
}

export type DeploymentService = 'frontend' | 'admin' | 'backend'
export type DeploymentStatus = 'in-progress' | 'success' | 'failed' | 'rolled-back'

export interface DeploymentRecord {
  id: string
  service: DeploymentService
  version: string
  commit: string
  environment: string
  status: DeploymentStatus
  triggeredBy: string
  deploymentId: string
  startedAt: string
  completedAt: string | null
  durationMs: number
  rollbackTo: string
  url: string
  notes: string
}

export interface SystemHealth {
  status: 'ok' | 'degraded' | 'unavailable'
  service: string
  version: string
  environment: string
  sentryEnabled: boolean
  dependencies: {
    mongodb: { status: DependencyStatus }
    redis: { status: DependencyStatus }
    smmProvider: { status: DependencyStatus; provider?: string; error?: string }
    paymentProvider: { status: DependencyStatus; provider?: string }
  }
  metrics: {
    startedAt: string
    uptimeSeconds: number
    totalRequests: number
    totalErrors: number
    errorRate: number
    latency: { p50: number; p95: number; p99: number }
    topRoutes: Array<{
      method: string
      route: string
      count: number
      errorCount: number
      lastDurationMs: number
      lastErrorAt: string | null
    }>
  }
  time: string
}

// ---------------------------------------------------------------------------
// Admin Integrations (encrypted provider credentials)
// ---------------------------------------------------------------------------

export type IntegrationProviderKey = 'telegram' | 'smm' | 'culture'

export type IntegrationStatus =
  | 'CONNECTED'
  | 'NOT_CONFIGURED'
  | 'CONNECTION_FAILED'
  | 'DISABLED'
  | 'TESTING'
  | 'EXPIRED'

export type IntegrationErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'INVALID_DESTINATION'
  | 'PROVIDER_UNAVAILABLE'
  | 'NOT_CONFIGURED'
  | 'UNSUPPORTED'
  | 'UNKNOWN_ERROR'

/** A secret field as seen by the admin — configured + masked ONLY. */
export interface SecretFieldView {
  configured: boolean
  masked: string | null
}

export interface IntegrationConnectionHistoryEntry {
  testedAt: string
  success: boolean
  latencyMs: number | null
  errorCode: string
}

/** Safe representation of one integration (never contains secrets). */
export interface IntegrationSummary {
  provider: IntegrationProviderKey
  displayName: string
  configured: boolean
  enabled: boolean
  status: IntegrationStatus
  lastTestedAt: string | null
  lastSuccessfulAt: string | null
  lastFailedAt: string | null
  lastErrorCode: string
  lastErrorMessage: string
  latencyMs: number | null
  credentials: Record<string, SecretFieldView>
  config: Record<string, unknown>
  connectionHistory: IntegrationConnectionHistoryEntry[]
}

/** Result of a connection test. */
export interface IntegrationTestResult {
  success: boolean
  provider: IntegrationProviderKey
  status: IntegrationStatus
  latencyMs: number
  checkedAt: string
  errorCode?: IntegrationErrorCode
  message?: string
  details?: Record<string, unknown>
}

/** Body used when saving an integration. Secret fields: omit = keep, '' = clear. */
export interface IntegrationSavePayload {
  displayName?: string
  isEnabled?: boolean
  secrets?: Partial<Record<string, string>>
  config?: Record<string, unknown>
}

