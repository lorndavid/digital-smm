/**
 * Re-syncs the provider catalogue (services + categories) from the SMM API.
 *
 * Usage (from backend/):
 *   npm run sync:catalog
 *
 * Requires SMMWIZ_API_KEY in backend/.env (SMM_PROVIDER=smmwiz). Rates are
 * written 1:1 from the provider — the storefront never marks prices up.
 * Existing services are updated in place; admin curation flags (isActive,
 * isFeatured, sortOrder) are preserved.
 */
import 'dotenv/config'
import { connectDatabase, disconnectDatabase } from '../src/config/database.js'
import { adminService } from '../src/services/admin.service.js'

async function main(): Promise<void> {
  await connectDatabase()
  const result = await adminService.syncProviderServices()
  console.log(
    `[sync:catalog] provider=${result.provider} total=${result.total} ` +
      `created=${result.created} updated=${result.updated}`,
  )
  await disconnectDatabase()
}

main().catch((err) => {
  console.error('[sync:catalog] failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
