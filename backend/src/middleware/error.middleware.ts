import type { ErrorRequestHandler, RequestHandler } from 'express'
import { ApiError } from '../utils/api-error.js'
import { logger } from '../utils/logger.js'

/** Catch-all for unmatched routes. */
export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: 'Not found', path: req.originalUrl })
}

/** Centralized error handler — every error ends up here. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({ error: err.message, details: err.details })
    return
  }

  const raw = err as { name?: string; code?: number; message?: string }
  if (raw.name === 'ValidationError') {
    res.status(400).json({ error: 'Validation error', details: raw.message })
    return
  }
  if (raw.name === 'CastError') {
    res.status(400).json({ error: 'Invalid identifier format' })
    return
  }
  if (raw.code === 11000) {
    res.status(409).json({ error: 'A record with the same value already exists' })
    return
  }

  logger.error('Unhandled error', err)
  res.status(500).json({ error: 'Internal server error' })
}
