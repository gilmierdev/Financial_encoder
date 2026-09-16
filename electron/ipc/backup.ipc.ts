import { app, BrowserWindow, dialog } from 'electron'
import * as path from 'path'
import { registerIpcHandler } from '../services/ipc-handler'
import { AppError } from '../services/ipc-handler'
import {
  BackupExportResult,
  buildBackupFileName,
  createBackup,
  deleteBackup,
  exportBackup,
  listBackups,
  RestoreFileResult,
  restoreBackup,
  restoreFromFile,
  BackupRecord,
} from '../database/backup.service'
import { getDatabaseStatus, DatabaseStatus } from '../database/connection'

export function registerBackupIpcHandlers(): void {
  registerIpcHandler<BackupRecord>('backup:create', async () => {
    return createBackup()
  })

  registerIpcHandler<BackupRecord[]>('backup:list', () => {
    return listBackups()
  })

  registerIpcHandler<DatabaseStatus>('backup:restore', async (_event, id) => {
    const parsed = Number(id)
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new AppError('VALIDATION_ERROR', 'A valid backup id is required.')
    }
    await restoreBackup(parsed)
    return getDatabaseStatus()
  })

  registerIpcHandler<boolean>('backup:delete', (_event, id) => {
    const parsed = Number(id)
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new AppError('VALIDATION_ERROR', 'A valid backup id is required.')
    }
    return deleteBackup(parsed)
  })

  registerIpcHandler<BackupExportResult>('backup:export', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const result = await dialog.showSaveDialog(win ?? undefined, {
      title: 'Export backup',
      defaultPath: path.join(app.getPath('documents'), buildBackupFileName()),
      filters: [
        { name: 'Financial Encoder Backup', extensions: ['febak'] },
        { name: 'SQLite database', extensions: ['db', 'sqlite'] },
      ],
    })

    if (result.canceled || !result.filePath) {
      throw new AppError('EXPORT_CANCELLED', 'Backup export cancelled.')
    }

    return exportBackup(result.filePath)
  })

  registerIpcHandler<RestoreFileResult>('backup:import', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const result = await dialog.showOpenDialog(win ?? undefined, {
      title: 'Restore from backup file',
      properties: ['openFile'],
      filters: [
        { name: 'Financial Encoder Backup', extensions: ['febak', 'db', 'sqlite'] },
        { name: 'All files', extensions: ['*'] },
      ],
    })

    if (result.canceled || result.filePaths.length === 0) {
      throw new AppError('BACKUP_IMPORT_CANCELLED', 'No file selected.')
    }

    // The external file is validated in main before anything is replaced.
    return restoreFromFile(result.filePaths[0])
  })
}