import { BrowserWindow, dialog } from 'electron'
import { registerIpcHandler } from '../services/ipc-handler'
import { AppError } from '../services/ipc-handler'
import { buildImportPreview, confirmImport, ImportMapping, ImportPreview, ImportResult } from '../import/import.service'

export function registerImportIpcHandlers(): void {
  registerIpcHandler<ImportPreview>('import:pick', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const result = await dialog.showOpenDialog(win ?? undefined, {
      title: 'Select a file to import',
      filters: [
        { name: 'Spreadsheets', extensions: ['csv', 'xlsx'] },
        { name: 'CSV', extensions: ['csv'] },
        { name: 'Excel Workbook', extensions: ['xlsx'] },
      ],
      properties: ['openFile'],
    })

    if (result.canceled || result.filePaths.length === 0) {
      throw new AppError('IMPORT_CANCELLED', 'No file selected.')
    }

    return buildImportPreview(result.filePaths[0])
  })

  registerIpcHandler<ImportResult>('import:confirm', async (_event, req) => {
    return confirmImport(req as ImportMapping)
  })
}