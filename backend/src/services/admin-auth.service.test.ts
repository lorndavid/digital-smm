import { describe, expect, it, vi } from 'vitest'

vi.mock('../config/env.js', () => ({
  env: {
    ADMIN_JWT_SECRET: 'test-admin-jwt-secret-0123456789',
    ADMIN_JWT_EXPIRES_IN: '1h',
  },
  corsOrigins: [],
}))

vi.mock('../utils/logger.js', () => ({ logger: { info: vi.fn() } }))

// Mock the admin repository so no DB connection is needed.
const { repoStub } = vi.hoisted(() => {
  const repoStub = vi.fn()
  return { repoStub }
})
vi.mock('../repositories/admin.repository.js', () => ({
  adminRepository: {
    findByEmail: repoStub,
    update: vi.fn(async () => null),
  },
}))

import { ApiError } from '../utils/api-error.js'
import {
  hashPassword,
  issueAdminToken,
  loginAdmin,
  verifyAdminToken,
  verifyPassword,
} from './admin-auth.service.js'

describe('admin-auth service', () => {
  it('hashes and verifies passwords (scrypt, salted)', () => {
    const hash = hashPassword('correct-horse')
    expect(hash).toContain(':')
    expect(verifyPassword('correct-horse', hash)).toBe(true)
    expect(verifyPassword('wrong', hash)).toBe(false)
    // Same password → different salt each time.
    expect(hashPassword('x')).not.toBe(hashPassword('x'))
  })

  it('returns false for malformed stored hash', () => {
    expect(verifyPassword('anything', 'not-a-hash')).toBe(false)
  })

  it('issues and verifies admin JWTs', async () => {
    const admin = {
      _id: { toString: () => 'admin_1' },
      email: 'admin@vidsmm.com',
      role: 'super_admin',
    } as unknown as Parameters<typeof issueAdminToken>[0]

    const token = await issueAdminToken(admin)
    const payload = await verifyAdminToken(token)
    expect(payload.sub).toBe('admin_1')
    expect(payload.email).toBe('admin@vidsmm.com')
    expect(payload.role).toBe('super_admin')
  })

  it('rejects tampered JWTs', async () => {
    const admin = {
      _id: { toString: () => 'admin_1' },
      email: 'a@b.com',
      role: 'admin',
    } as unknown as Parameters<typeof issueAdminToken>[0]
    const token = await issueAdminToken(admin)
    await expect(verifyAdminToken(`${token.slice(0, -2)}xx`)).rejects.toBeInstanceOf(ApiError)
  })

  it('login rejects wrong password', async () => {
    const hash = hashPassword('secret-pass')
    repoStub.mockResolvedValueOnce({
      email: 'a@b.com',
      passwordHash: hash,
      isActive: true,
      role: 'admin',
      _id: { toString: () => 'a1' },
      name: '',
    })
    await expect(loginAdmin('a@b.com', 'wrong-pass')).rejects.toMatchObject({ statusCode: 401 })
  })

  it('login rejects unknown email', async () => {
    repoStub.mockResolvedValueOnce(null)
    await expect(loginAdmin('ghost@x.com', 'whatever')).rejects.toMatchObject({ statusCode: 401 })
  })

  it('login succeeds with correct credentials', async () => {
    const hash = hashPassword('secret-pass')
    repoStub.mockResolvedValueOnce({
      email: 'a@b.com',
      passwordHash: hash,
      isActive: true,
      role: 'super_admin',
      _id: { toString: () => 'a1' },
      name: 'Admin',
    })
    const result = await loginAdmin('a@b.com', 'secret-pass')
    expect(result.token).toBeTruthy()
    expect(result.admin.role).toBe('super_admin')
    expect(result.admin.email).toBe('a@b.com')
  })
})
