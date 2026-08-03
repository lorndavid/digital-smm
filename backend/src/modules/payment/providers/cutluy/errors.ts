import type { CutLuyErrorCode, CutLuyErrorBody } from './types.js'

/**
 * Provider-level error raised for CutLuy API failures. The core layer
 * translates these into user-facing ApiErrors; this class preserves the
 * machine-readable error code for logging / admin diagnostics.
 */
export class CutLuyError extends Error {
  constructor(
    public readonly code: CutLuyErrorCode,
    message: string,
    public readonly httpStatus = 400,
  ) {
    super(message)
    this.name = 'CutLuyError'
  }

  /** Maps a CutLuy HTTP status + error body to a CutLuyError. */
  static fromResponse(status: number, body?: CutLuyErrorBody): CutLuyError {
    const code = body?.error ?? 'payment_provider_error'
    const message = body?.message ?? `CutLuy request failed with HTTP ${status}`
    return new CutLuyError(code, message, status)
  }

  /** Whether the failure is transient and worth retrying. */
  get retryable(): boolean {
    return (
      this.code === 'payment_provider_error' ||
      this.code === 'quota_exceeded' ||
      this.httpStatus >= 500
    )
  }
}
