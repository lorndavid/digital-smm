import { describe, expect, it } from 'vitest'
import { classifyError } from './alert.service.js'

describe('classifyError', () => {
  it('classifies MongoDB errors as DATABASE_ERROR', () => {
    expect(classifyError(new Error('MongoServerError: connection refused')).category).toBe(
      'DATABASE_ERROR',
    )
  })

  it('classifies Redis errors as REDIS_ERROR', () => {
    expect(classifyError(new Error('Redis connection lost')).category).toBe('REDIS_ERROR')
  })

  it('classifies network errors as NETWORK_ERROR', () => {
    for (const msg of ['ECONNREFUSED', 'ETIMEDOUT', 'socket hang up', 'fetch failed']) {
      expect(classifyError(new Error(msg)).category).toBe('NETWORK_ERROR')
    }
  })

  it('classifies provider errors as SMM_PROVIDER_ERROR', () => {
    expect(classifyError(new Error('smmwiz API returned 401')).category).toBe('SMM_PROVIDER_ERROR')
  })

  it('classifies webhook signature errors as WEBHOOK_ERROR', () => {
    expect(classifyError(new Error('signature mismatch')).category).toBe('WEBHOOK_ERROR')
  })

  it('classifies payment errors as PAYMENT_ERROR', () => {
    expect(classifyError(new Error('CutLuy payment verification failed')).category).toBe(
      'PAYMENT_ERROR',
    )
  })

  it('falls back to INTERNAL_SERVER_ERROR for unknown errors', () => {
    expect(classifyError(new Error('weird thing happened')).category).toBe('INTERNAL_SERVER_ERROR')
  })

  it('never crashes on non-Error input', () => {
    expect(classifyError(undefined).category).toBe('INTERNAL_SERVER_ERROR')
    expect(classifyError('plain string').category).toBe('INTERNAL_SERVER_ERROR')
    expect(classifyError(null).message.length).toBeGreaterThan(0)
  })

  it('redacts credentials from MongoDB URIs in messages', () => {
    const err = new Error('Failed: mongodb+srv://user:supersecret@cluster0.mongodb.net/db')
    const { message } = classifyError(err)
    expect(message).not.toContain('supersecret')
    expect(message).toContain('***')
  })
})
