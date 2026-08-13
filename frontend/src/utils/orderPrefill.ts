import type { Order } from '@/types/models'

/**
 * Builds the route query that prefills the Explore Services order form with a
 * previous order's details (service, quantity, options).
 *
 * The link is intentionally NOT carried over — every re-order is a fresh
 * target, so the Link field stays empty for the customer to paste the new URL.
 *
 * The Explore view reads these on mount: ?serviceId&serviceName&quantity
 * &params (JSON). Both "Order again" entry points (order detail page + Orders
 * list row action) share this single contract.
 */
export function buildOrderAgainQuery(order: Order): Record<string, string | number> {
  const query: Record<string, string | number> = {}
  const service = order.service
  if (service && typeof service === 'object') {
    if (service._id) query.serviceId = service._id
    if (service.name) query.serviceName = service.name
  } else if (typeof service === 'string' && service) {
    query.serviceId = service
  }
  if (order.quantity > 0) query.quantity = order.quantity
  if (order.params && Object.keys(order.params).length > 0) {
    query.params = JSON.stringify(order.params)
  }
  return query
}
