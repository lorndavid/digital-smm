import type { Order } from '@/types/models'

/**
 * Builds the route query that prefills the Explore Services order form with a
 * previous order's details (service, link, quantity, options).
 *
 * The Explore view reads these on mount: ?serviceId&serviceName&link&quantity
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
  if (order.link) query.link = order.link
  if (order.quantity > 0) query.quantity = order.quantity
  if (order.params && Object.keys(order.params).length > 0) {
    query.params = JSON.stringify(order.params)
  }
  return query
}
