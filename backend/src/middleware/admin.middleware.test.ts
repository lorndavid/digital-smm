import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../config/env.js', () => ({
  env: {
    ADMIN_JWT_SECRET: 'test-admin-jwt-secret-0123456789',
    ADMIN_JWT_EXPIRES_IN: '1h',
  },
  corsOrigins: [],
}))

// Stub the admin-auth verify to control the session claims.
const { verifyStub } = vi.hoisted(() => {
  const verifyStub = vi.fn()
  return { verifyStub }
})
vi.mock('../services/admin-auth.service.js', () => ({
  verifyAdminToken: verifyStub,
}))

import type { NextFunction, Request, Response } from 'express'
import { requireAdmin, requireAdminAuth, requireSuperAdmin } from './admin.middleware.js'

function makeReq(token?: string): Request {
  return {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  } as unknown as Request
}

function run(
  mw: (req: Request, res: Response, next: NextFunction) => void | Promise<void>,
  req: Request,
): Promise<{ passed: boolean; error: { statusCode?: number } | null }> {
  return new Promise((resolve) => {
    let passed = false
    let error: { statusCode?: number } | null = null
    const next: NextFunction = (err?: unknown) => {
      if (err) error = err as { statusCode?: number }
      else passed = true
      resolve({ passed, error })
    }
    void mw(req, {} as Response, next)
  })
}

describe('admin middleware (JWT)', () => {
  beforeEach(() => verifyStub.mockReset())

  it('requireAdminAuth rejects missing token', async () => {
    const { error } = await run(requireAdminAuth, makeReq())
    expect(error?.statusCode).toBe(401)
  })

  it('requireAdminAuth rejects invalid token', async () => {
    // Matches verifyAdminToken's real ApiError(401) behaviour.
    const err = new Error('Invalid or expired admin session') as Error & { statusCode?: number }
    err.statusCode = 401
    verifyStub.mockRejectedValueOnce(err)
    const { error } = await run(requireAdminAuth, makeReq('garbage'))
    expect(error?.statusCode).toBe(401)
  })

  it('requireAdminAuth attaches admin claims', async () => {
    verifyStub.mockResolvedValueOnce({ sub: 'a1', email: 'x@x.com', role: 'admin' })
    const req = makeReq('token')
    const { passed } = await run(requireAdminAuth, req)
    expect(passed).toBe(true)
    expect(req.admin?.role).toBe('admin')
  })

  it('requireAdmin allows admin role', async () => {
    const req = { admin: { sub: 'a1', email: 'x@x.com', role: 'admin' } } as unknown as Request
    const { passed } = await run(requireAdmin, req)
    expect(passed).toBe(true)
  })

  it('requireSuperAdmin rejects plain admin', async () => {
    const req = { admin: { sub: 'a1', email: 'x@x.com', role: 'admin' } } as unknown as Request
    const { error } = await run(requireSuperAdmin, req)
    expect(error?.statusCode).toBe(403)
  })

  it('requireSuperAdmin allows super_admin', async () => {
    const req = { admin: { sub: 'a1', email: 'x@x.com', role: 'super_admin' } } as unknown as Request
    const { passed } = await run(requireSuperAdmin, req)
    expect(passed).toBe(true)
  })

  it('requireSuperAdmin rejects missing admin context', async () => {
    const { error } = await run(requireSuperAdmin, {} as Request)
    expect(error?.statusCode).toBe(401)
  })
})
