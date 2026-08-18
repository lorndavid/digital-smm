import type { SmmProvider } from '../../interfaces/smm-provider.interface.js'
import { logger } from '../../utils/logger.js'
import { reportAlert } from './alert.service.js'

/**
 * SMM provider monitoring wrapper.
 *
 * Wraps every provider operation with structured logging: operation name,
 * duration, result (success/failure) and safe identifiers. Never logs the
 * API key, order links or customer payloads — only business-level ids.
 */

type OperationKey =
  | 'getServices'
  | 'createOrder'
  | 'getOrderStatus'
  | 'getOrdersStatus'
  | 'createRefill'
  | 'createRefills'
  | 'getRefillStatus'
  | 'getRefillsStatus'
  | 'cancelOrders'
  | 'getBalance'

const PROVIDER_OPERATIONS: OperationKey[] = [
  'getServices',
  'createOrder',
  'getOrderStatus',
  'getOrdersStatus',
  'createRefill',
  'createRefills',
  'getRefillStatus',
  'getRefillsStatus',
  'cancelOrders',
  'getBalance',
]

/** Wraps a provider instance so every operation is logged + timed. */
export function monitorSmmProvider(provider: SmmProvider): SmmProvider {
  const wrapped = provider as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>

  for (const operation of PROVIDER_OPERATIONS) {
    const original = wrapped[operation]
    if (typeof original !== 'function') continue

    wrapped[operation] = async (...args: unknown[]): Promise<unknown> => {
      const startedAt = Date.now()
      const safeId = extractSafeId(operation, args)
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await original.apply(provider, args as any[])
        logger.info('[smm-monitor] ok', {
          provider: provider.name,
          operation,
          duration_ms: Date.now() - startedAt,
          result: 'success',
          ...safeId,
        })
        return result
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger.error('[smm-monitor] failed', {
          provider: provider.name,
          operation,
          duration_ms: Date.now() - startedAt,
          result: 'error',
          error: message,
          ...safeId,
        })
        // Operational alert (deduplicated + level gated by the alert service).
        // Safe metadata only: provider name + operation + truncated message.
        reportAlert({
          category: 'SMM_PROVIDER_ERROR',
          level: 'warning',
          service: 'smm',
          event: 'provider_operation_failed',
          message: `${provider.name} ${operation} failed`,
          details: message.slice(0, 300),
        })
        throw err
      }
    }
  }

  return provider
}

/**
 * Extracts only safe identifiers from an operation's args (provider order
 * ids, refill ids, service ids) — never links, quantities or payloads.
 */
function extractSafeId(operation: OperationKey, args: unknown[]): Record<string, unknown> {
  const first = args[0]
  switch (operation) {
    case 'getOrderStatus':
    case 'createRefill':
      return typeof first === 'number' ? { orderId: first } : {}
    case 'getOrdersStatus':
    case 'cancelOrders':
    case 'createRefills':
      return Array.isArray(first) ? { orderIds: first.slice(0, 10) } : {}
    case 'getRefillStatus':
      return typeof first === 'number' ? { refillId: first } : {}
    case 'getRefillsStatus':
      return Array.isArray(first) ? { refillIds: first.slice(0, 10) } : {}
    case 'createOrder':
      if (first && typeof first === 'object') {
        const input = first as { service?: number }
        return typeof input.service === 'number' ? { providerServiceId: input.service } : {}
      }
      return {}
    default:
      return {}
  }
}
