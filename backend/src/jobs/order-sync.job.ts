import { env } from '../config/env.js'
import { orderRepository } from '../repositories/order.repository.js'
import { getSmmProvider } from '../services/smm/provider.factory.js'
import { emitOrderStatus } from '../services/order/events.bus.js'
import { logger } from '../utils/logger.js'

const STATUS_MAP: Record<string, string> = {
  Completed: 'Completed',
  Cancelled: 'Cancelled',
  Refunded: 'Refunded',
  Failed: 'Failed',
  'In progress': 'In progress',
  Partial: 'Partial',
}

let timer: NodeJS.Timeout | null = null

/**
 * Polls the provider for the status of in-flight orders and syncs the
 * local database (status, remains, startCount, charge).
 * Groups orders by provider and queries each provider separately.
 */
export async function runOrderSync(): Promise<void> {
  try {
    const orders = await orderRepository.findSyncable(100)
    if (orders.length === 0) return

    // Group order IDs by provider so each provider is queried once.
    const byProvider = new Map<string, number[]>()
    for (const order of orders) {
      const service = order.service
      const providerName =
        service && typeof service === 'object' && 'provider' in service
          ? (service as { provider: string }).provider
          : 'smmwiz'
      const ids = byProvider.get(providerName) ?? []
      if (order.providerOrderId !== null && order.providerOrderId !== undefined) {
        ids.push(order.providerOrderId)
      }
      byProvider.set(providerName, ids)
    }

    let updated = 0

    for (const [providerName, ids] of byProvider) {
      if (ids.length === 0) continue
      const provider = getSmmProvider(providerName)
      const statuses = await provider.getOrdersStatus(ids)

      for (const order of orders) {
        if (order.providerOrderId === null || order.providerOrderId === undefined) continue
        const info = statuses[String(order.providerOrderId)]
        if (!info || info.error) continue

        const changes: Record<string, unknown> = {}
        const mapped = info.status ? STATUS_MAP[info.status] : undefined
        if (mapped && mapped !== order.status) {
          changes.status = mapped
          if (mapped === 'Completed') changes.remains = 0
        }
        // Only write (and push) fields that ACTUALLY changed — a provider
        // payload with the same remains/startCount/charge is a no-op, so we
        // neither touch the DB nor spam the SSE stream every sync cycle.
        if (
          info.remains !== undefined &&
          Number.isFinite(info.remains) &&
          info.remains !== order.remains
        ) {
          changes.remains = info.remains
        }
        if (
          info.startCount !== undefined &&
          Number.isFinite(info.startCount) &&
          info.startCount !== order.startCount
        ) {
          changes.startCount = info.startCount
        }
        if (
          info.charge !== undefined &&
          Number.isFinite(info.charge) &&
          info.charge !== order.charge
        ) {
          changes.charge = info.charge
        }

        if (Object.keys(changes).length > 0) {
          await orderRepository.update(order._id.toString(), { $set: changes })
          // Push the change to the customer's open SSE streams immediately —
          // the dashboard's 5s polling is now only the safety net.
          emitOrderStatus({
            userId: order.user.toString(),
            orderId: order._id.toString(),
            orderNumber: order.orderNumber,
            ...changes,
            updatedAt: new Date().toISOString(),
          })
          updated += 1
        }
      }
    }

    if (updated > 0) logger.info(`[job] order-sync updated ${updated} orders`)
  } catch (err) {
    logger.error('[job] order-sync failed', err)
  }
}

export function startOrderSyncJob(): void {
  if (!env.ENABLE_ORDER_SYNC_JOB) return
  if (timer) return
  timer = setInterval(() => void runOrderSync(), env.ORDER_SYNC_INTERVAL_MS)
  logger.info(`[job] order-sync scheduled every ${env.ORDER_SYNC_INTERVAL_MS}ms`)
  void runOrderSync()
}

export function stopOrderSyncJob(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
