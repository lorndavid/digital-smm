import 'dotenv/config'
import { connectDatabase, disconnectDatabase } from '../src/config/database.js'
import { adminService } from '../src/services/admin.service.js'
import { serviceRepository } from '../src/repositories/catalog.repository.js'
import { logger } from '../src/utils/logger.js'

async function main(): Promise<void> {
  await connectDatabase()
  const defaultSetting = await adminService.getSetting('default_profit_percentage')
  const profitPercentage = typeof defaultSetting?.value === 'number'
    ? defaultSetting.value
    : (Number(defaultSetting?.value) || 10)

  logger.info(`[apply-profit] Applying ${profitPercentage}% profit markup across catalog...`)
  const updatedCount = await serviceRepository.bulkSetProfitPercentage({}, profitPercentage)
  logger.info(`[apply-profit] Updated ${updatedCount} services with +${profitPercentage}% profit!`)

  await disconnectDatabase()
}

main().catch((err) => {
  logger.error('[apply-profit] Failed:', err)
  process.exit(1)
})
