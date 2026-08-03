import { env } from '../config/env.js'
import { orderRepository } from '../repositories/order.repository.js'
import { getSmmProvider } from '../services/smm/provider.factory.js'
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
 */
export async function runOrderSync(): Promise<void> {
  try {
    const orders = await orderRepository.findSyncable(100)
    if (orders.length === 0) return

    const provider = getSmmProvider()
    const ids = orders
      .map((o) => o.providerOrderId)
      .filter((id): id is number => id !== null && id !== undefined)

    const statuses = await provider.getOrdersStatus(ids)
    let updated = 0

    for (const order of orders) {
      const info = statuses[String(order.providerOrderId)]
      if (!info || info.error) continue

      const changes: Record<string, unknown> = {}
      const mapped = info.status ? STATUS_MAP[info.status] : undefined
      if (mapped && mapped !== order.status) {
        changes.status = mapped
        if (mapped === 'Completed') changes.remains = 0
      }
      if (info.remains !== undefined && Number.isFinite(info.remains)) changes.remains = info.remains
      if (info.startCount !== undefined && Number.isFinite(info.startCount)) {
        changes.startCount = info.startCount
      }
      if (info.charge !== undefined && Number.isFinite(info.charge)) changes.charge = info.charge

      if (Object.keys(changes).length > 0) {
        await orderRepository.update(order._id.toString(), { $set: changes })
        updated += 1
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
