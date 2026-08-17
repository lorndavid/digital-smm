import type { RequestHandler } from 'express'
import { runWithRequestContext } from '../utils/request-context.js'

/**
 * Assigns every request a correlation id and runs the rest of the chain
 * inside the AsyncLocalStorage context so logs/metrics/errors emitted
 * downstream share the same requestId.
 *
 * Mounted BEFORE all other middleware/routes in createApp().
 */
export const requestContextMiddleware: RequestHandler = (req, _res, next) => {
  runWithRequestContext(() => next())
}
