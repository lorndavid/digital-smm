import { env } from '../config/env.js'
import { getRequestId } from './request-context.js'
import { redact } from './redact.js'

/**
 * Structured logger with request correlation.
 *
 * Every call emits a single-line JSON object:
 *
 *   {"timestamp":"…","level":"info","service":"backend","requestId":"…","message":"…","meta":…}
 *
 * The `requestId` is inherited from the request context (see
 * middleware/request-context.middleware.ts), so logs from one HTTP request
 * are traceable end-to-end. In development the JSON is pretty-printed with
 * colors for readability.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const SERVICE = 'backend'

const isDev = env.NODE_ENV !== 'production'

interface LogEntry {
  timestamp: string
  level: LogLevel
  service: string
  requestId?: string | null
  message: string
  meta?: unknown
}

function stamp(): string {
  return new Date().toISOString()
}

/**
 * Serializes meta values defensively (Error → message, never throws) and
 * redacts credential-shaped values so secrets can never reach the log
 * stream, even if a caller passes them in `meta` by accident.
 */
function safeMeta(meta: unknown): unknown {
  if (meta instanceof Error) {
    return redact({
      message: meta.message,
      name: meta.name,
      stack: env.NODE_ENV === 'production' ? undefined : meta.stack,
    })
  }
  return redact(meta)
}

function write(level: LogLevel, message: string, meta?: unknown): void {
  const entry: LogEntry = {
    timestamp: stamp(),
    level,
    service: SERVICE,
    requestId: getRequestId(),
    message,
    ...(meta !== undefined ? { meta: safeMeta(meta) } : {}),
  }

  const line = JSON.stringify(entry)
  const out = isDev ? `[${stamp()}] [${level.toUpperCase()}] ${message}` : line

  if (level === 'error') console.error(out, isDev && meta !== undefined ? safeMeta(meta) : '')
  else if (level === 'warn') console.warn(out, isDev && meta !== undefined ? safeMeta(meta) : '')
  else console.log(out, isDev && meta !== undefined ? safeMeta(meta) : '')
}

export const logger = {
  debug: (msg: string, meta?: unknown) => write('debug', msg, meta),
  info: (msg: string, meta?: unknown) => write('info', msg, meta),
  warn: (msg: string, meta?: unknown) => write('warn', msg, meta),
  error: (msg: string, meta?: unknown) => write('error', msg, meta),
}

/** Creates a child logger with a fixed component tag (e.g. '[payment]'). */
export function childLogger(component: string) {
  const tag = `[${component}]`
  return {
    debug: (msg: string, meta?: unknown) => write('debug', `${tag} ${msg}`, meta),
    info: (msg: string, meta?: unknown) => write('info', `${tag} ${msg}`, meta),
    warn: (msg: string, meta?: unknown) => write('warn', `${tag} ${msg}`, meta),
    error: (msg: string, meta?: unknown) => write('error', `${tag} ${msg}`, meta),
  }
}
