/**
 * Create or update the super admin account in MongoDB.
 *
 * Usage (from backend/):
 *   SUPER_ADMIN_PASSWORD='YOUR_PASSWORD' npm run create:super-admin -- --email admin@example.com
 *
 * Prefer setting the password via the SUPER_ADMIN_PASSWORD env var so it never
 * appears in shell history; --password is accepted as a fallback. Requires a
 * running MongoDB (MONGODB_URI in backend/.env). The password is scrypt-hashed
 * and never logged or stored in plaintext.
 */
import 'dotenv/config'
import { connectDatabase, disconnectDatabase } from '../src/config/database.js'
import { adminRepository } from '../src/repositories/admin.repository.js'
import { hashPassword } from '../src/services/admin-auth.service.js'
import { logger } from '../src/utils/logger.js'
import { AdminModel } from '../src/models/admin.model.js'

interface CliArgs {
  email: string
  password?: string
  role: 'super_admin' | 'admin'
}

function parseArgs(argv: string[]): CliArgs {
  const args: Record<string, string> = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg?.startsWith('--')) {
      const key = arg.slice(2)
      args[key] = argv[i + 1] ?? ''
      i += 1
    }
  }
  const email = args.email?.trim().toLowerCase()
  if (!email) throw new Error('Missing required flag: --email <email>')
  const role = args.role === 'admin' ? 'admin' : 'super_admin'
  const password = process.env.SUPER_ADMIN_PASSWORD || args.password || undefined
  return { email, password, role }
}

async function main(): Promise<void> {
  const { email, password, role } = parseArgs(process.argv.slice(2))

  await connectDatabase()

  const existing = await adminRepository.findByEmail(email)
  if (existing) {
    await adminRepository.setRole(existing._id.toString(), role)
    await adminRepository.setActive(existing._id.toString(), true)
    logger.info(`[create-super-admin] Updated ${email} → role "${role}" (id: ${existing._id})`)
    await disconnectDatabase()
    return
  }

  if (!password) {
    logger.error('[create-super-admin] Admin does not exist — set SUPER_ADMIN_PASSWORD to create them.')
    await disconnectDatabase()
    process.exit(1)
  }

  await AdminModel.create({
    email,
    passwordHash: hashPassword(password),
    role,
    isActive: true,
  })
  logger.info(
    `[create-super-admin] Created ${email} with role "${role}". ` +
      'They can now sign in to the admin panel with this email + password.',
  )
  await disconnectDatabase()
}

main().catch((err) => {
  logger.error('[create-super-admin] Failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
