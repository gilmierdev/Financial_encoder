import { registerIpcHandler } from '../services/ipc-handler'
import { getDatabaseStatus, initDatabase, DatabaseStatus } from '../database/connection'
import { resetAllData, ResetResult } from '../database/reset.service'
import { logger } from '../services/logger.service'

export function registerDatabaseIpcHandlers(): void {
  registerIpcHandler<DatabaseStatus>('db:init', () => {
    initDatabase()
    const status = getDatabaseStatus()
    logger.info(`db:init => ${JSON.stringify(status)}`)
    return status
  })

  registerIpcHandler<DatabaseStatus>('db:status', () => {
    return getDatabaseStatus()
  })

  registerIpcHandler<ResetResult>('db:reset', async () => {
    return resetAllData()
  })
}