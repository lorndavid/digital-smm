/**
 * Strongly-typed analytics events.
 *
 * Only events that map to REAL application behaviour are declared. Event
 * parameters are strictly limited to business-level data — never tokens,
 * passwords, payment secrets or private customer fields.
 */

/** Business identifiers safe to send to analytics. */
export interface AnalyticsParams {
  /** Internal service id (e.g. a Mongo _id or provider service id). */
  service_id?: string
  /** Platform slug: tiktok | facebook | instagram | youtube | telegram. */
  platform?: string
  /** Category name or slug. */
  category?: string
  /** Service type: Default | Package | SEO | … */
  service_type?: string
  /** Order type: order | topup. */
  order_type?: string
  /** Payment/order currency (always USD today). */
  currency?: string
  /** Monetary value (amount, in the event's currency). */
  value?: number
  /** Quantity (order quantity, top-up amount, etc.). */
  quantity?: number
  /** Result of an attempt: success | failed | cancelled | expired. */
  result?: string
  /** Which provider handled the action: mock | cutluy | abapayway | smmwiz. */
  provider?: string
  /** Free-text search term (trimmed, length-capped). */
  search_term?: string
  /** Route name (e.g. 'home', 'services') — from the router, not the URL. */
  route_name?: string
  /** Order status after a transition (Completed, Processing, …). */
  order_status?: string
  /** Whether the user was signed in at the time of the event. */
  signed_in?: boolean
  /** Payment status: paid | failed | expired | refunded. */
  payment_status?: string
  // RUM / performance (numeric ms or unitless scores)
  lcp?: number
  cls?: number
  inp?: number
  ttfb?: number
}

/** The canonical, typed event names this app may send. */
export type AnalyticsEventName =
  // Identity
  | 'sign_up'
  | 'login'
  | 'logout'
  // Service browsing
  | 'service_view'
  | 'service_search'
  | 'service_select'
  // Order funnel
  | 'order_start'
  | 'order_create'
  | 'order_complete'
  // Wallet
  | 'wallet_view'
  | 'wallet_topup_start'
  | 'wallet_topup_success'
  // Payments (financial truth comes from backend-verified state)
  | 'payment_create'
  | 'payment_success'
  | 'payment_failed'
  | 'payment_expired'
  | 'refund'
  // Real User Monitoring (frontend performance)
  | 'web_vitals'

/** A sanitized analytics event ready for GA4. */
export interface AnalyticsEvent {
  name: AnalyticsEventName
  params: AnalyticsParams
}
