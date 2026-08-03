import type {
  CutLuyCreatePaymentRequest,
  CutLuyErrorCode,
  CutLuyPayment,
} from './types.js'
import { CutLuyError } from './errors.js'

/**
 * Thin HTTP client for the CutLuy REST API.
 *
 *   POST /v1/payments            → create a KHQR payment (201)
 *   GET  /v1/payments/:id        → fetch current state (polling)
 *   GET  /v1/payments            → list store payments
 *
 * Authentication: `Authorization: Bearer ck_live_...` (server side only).
 */
export class CutLuyClient {
  constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string,
    private readonly timeoutMs = 30_000,
  ) {}

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    }
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.apiUrl}${path}`, {
      ...init,
      headers: { ...this.headers, ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(this.timeoutMs),
    })

    const text = await res.text()
    let json: unknown = null
    if (text) {
      try {
        json = JSON.parse(text)
      } catch {
        json = null
      }
    }

    if (!res.ok) {
      const body = (json ?? {}) as { error?: string; message?: string }
      throw CutLuyError.fromResponse(res.status, {
        error: (body.error as CutLuyErrorCode) ?? 'payment_provider_error',
        message: body.message ?? `CutLuy HTTP ${res.status}`,
      })
    }
    return json as T
  }

  /** Creates a KHQR payment. Returns the provider payment object. */
  async createPayment(input: CutLuyCreatePaymentRequest): Promise<CutLuyPayment> {
    return this.request<CutLuyPayment>('/payments', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  }

  /** Fetches a single payment (poll this if you're not using webhooks). */
  async getPayment(id: string): Promise<CutLuyPayment> {
    return this.request<CutLuyPayment>(`/payments/${encodeURIComponent(id)}`)
  }
}
