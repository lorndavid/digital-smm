/** Minimal structured logger with timestamps. */
type Meta = unknown

const stamp = () => new Date().toISOString()

export const logger = {
  debug: (msg: string, meta?: Meta) => console.debug(`[${stamp()}] [DEBUG] ${msg}`, meta ?? ''),
  info: (msg: string, meta?: Meta) => console.info(`[${stamp()}] [INFO] ${msg}`, meta ?? ''),
  warn: (msg: string, meta?: Meta) => console.warn(`[${stamp()}] [WARN] ${msg}`, meta ?? ''),
  error: (msg: string, meta?: Meta) => console.error(`[${stamp()}] [ERROR] ${msg}`, meta ?? ''),
}
