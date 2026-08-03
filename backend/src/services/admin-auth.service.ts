import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'
import { env } from '../config/env.js'
import { ApiError } from '../utils/api-error.js'
import { adminRepository } from '../repositories/admin.repository.js'
import { AdminModel, type AdminDoc, type AdminRole } from '../models/admin.model.js'
import { logger } from '../utils/logger.js'

/**
 * Admin authentication — fully independent of Clerk.
 *
 * Admins sign in with email + password (stored in MongoDB). Passwords are
 * hashed with scrypt (salt + timing-safe compare) and sessions are issued as
 * HS256 JWTs signed with ADMIN_JWT_SECRET.
 */

// ---------------------------------------------------------------------------
// Password hashing (Node built-in scrypt — no native deps)
// ---------------------------------------------------------------------------

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const candidate = scryptSync(password, salt, 64)
  const expected = Buffer.from(hash, 'hex')
  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}

// ---------------------------------------------------------------------------
// JWT issue / verify
// ---------------------------------------------------------------------------

const secretKey = new TextEncoder().encode(env.ADMIN_JWT_SECRET)

export interface AdminTokenPayload {
  sub: string
  email: string
  role: AdminRole
}

export async function issueAdminToken(admin: AdminDoc): Promise<string> {
  return new SignJWT({ email: admin.email, role: admin.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(admin._id.toString())
    .setIssuedAt()
    .setExpirationTime(env.ADMIN_JWT_EXPIRES_IN)
    .sign(secretKey)
}

export async function verifyAdminToken(token: string): Promise<AdminTokenPayload> {
  try {
    const { payload } = await jwtVerify(token, secretKey, { algorithms: ['HS256'] })
    if (!payload.sub || !payload.role) throw new Error('Missing claims')
    return {
      sub: payload.sub,
      email: String(payload.email ?? ''),
      role: payload.role as AdminRole,
    }
  } catch {
    throw new ApiError(401, 'Invalid or expired admin session')
  }
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export async function loginAdmin(email: string, password: string): Promise<{
  token: string
  admin: { id: string; email: string; name: string; role: AdminRole }
}> {
  const admin = await adminRepository.findByEmail(email)
  if (!admin || !admin.isActive || !verifyPassword(password, admin.passwordHash)) {
    // Same error for unknown email / wrong password / disabled account —
    // no account enumeration.
    throw new ApiError(401, 'Invalid email or password')
  }
  await adminRepository.update(admin._id.toString(), { lastLoginAt: new Date() })
  const token = await issueAdminToken(admin)
  return {
    token,
    admin: {
      id: admin._id.toString(),
      email: admin.email,
      name: admin.name,
      role: admin.role,
    },
  }
}

// ---------------------------------------------------------------------------
// Seed the first super admin from env (optional, runs at boot)
// ---------------------------------------------------------------------------

export async function seedSuperAdmin(): Promise<void> {
  if (!env.SUPER_ADMIN_EMAIL || !env.SUPER_ADMIN_PASSWORD) return
  const existing = await adminRepository.findByEmail(env.SUPER_ADMIN_EMAIL)
  if (existing) return
  const role: AdminRole = 'super_admin'
  await AdminModel.create({
    email: env.SUPER_ADMIN_EMAIL.trim().toLowerCase(),
    passwordHash: hashPassword(env.SUPER_ADMIN_PASSWORD),
    role,
    isActive: true,
  })
  logger.info(`[admin] Seeded super admin account for ${env.SUPER_ADMIN_EMAIL}`)
}
