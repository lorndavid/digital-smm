import type { ErrorRequestHandler, RequestHandler } from 'express'
import * as Sentry from '@sentry/node'
import { ApiError } from '../utils/api-error.js'
import { logger } from '../utils/logger.js'
import { env } from '../config/env.js'

/** Catch-all for unmatched routes. */
export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: 'Not found', path: req.originalUrl })
}

/**
 * Centralized error handler — every error ends up here.
 *
 * Pipeline: route → controller → service → error middleware → Sentry →
 * safe HTTP response. Development may include helpful details; production
 * never returns stack traces, database URIs, secrets or internal tokens.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const raw = err as { name?: string; code?: number; message?: string; statusCode?: number }

  if (err instanceof ApiError) {
    // Expected business errors (400/401/403/404/409/503…) — logged, not
    // sent to Sentry (they're not defects).
    res.status(err.statusCode).json({ error: err.message, details: err.details })
    return
  }

  // Known framework/model error shapes — safe messages, no internals.
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

  // body-parser errors (express.json / urlencoded): map their status codes
  // so malformed payloads get 400 and oversized bodies get 413 instead of
  // falling through to a generic 500.
  const bp = err as { type?: string; status?: number; statusCode?: number }
  if (bp.type === 'entity.too.large') {
    res.status(413).json({ error: 'Request body too large' })
    return
  }
  if (bp.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Malformed JSON body' })
    return
  }
  if (typeof bp.statusCode === 'number' && bp.statusCode >= 400 && bp.statusCode < 500) {
    res.status(bp.statusCode).json({ error: raw.message ?? 'Bad request' })
    return
  }

  // Unexpected 5xx — report to Sentry (when enabled) and log with the
  // request id, then return a safe response.
  logger.error('Unhandled error', err)

  if (env.SENTRY_DSN) {
    try {
      Sentry.captureException(err)
    } catch {
      /* Sentry must never break the response path */
    }
  }

  if (env.NODE_ENV === 'production') {
    res.status(500).json({ error: 'Internal server error' })
    return
  }

  // Development: helpful but still redacted details.
  const message = raw.message ?? 'Internal server error'
  res.status(500).json({ error: message })
}
