import { BrowserWindow, dialog } from 'electron'
import { registerIpcHandler } from '../services/ipc-handler'
import { AppError } from '../services/ipc-handler'
import { parseDocumentLines, readDocument, ReadDocumentResult, ParsedDocumentLine } from '../ocr/ocr.service'

export interface OcrParseRequest {
  text: string
  fileName: string
}

export function registerOcrIpcHandlers(): void {
  registerIpcHandler<ReadDocumentResult>('ocr:pick', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const result = await dialog.showOpenDialog(win ?? undefined, {
      title: 'Select a document to read',
      filters: [
        { name: 'Documents & images', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'bmp', 'tif', 'tiff'] },
        { name: 'PDF', extensions: ['pdf'] },
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tif', 'tiff'] },
      ],
      properties: ['openFile'],
    })

    if (result.canceled || result.filePaths.length === 0) {
      throw new AppError('OCR_CANCELLED', 'No file selected.')
    }

    return readDocument(result.filePaths[0])
  })

  registerIpcHandler<ParsedDocumentLine[]>('ocr:parse', (_event, raw) => {
    const request = (raw ?? {}) as Record<string, unknown>
    if (typeof request.text !== 'string') {
      throw new AppError('VALIDATION_ERROR', 'Document text is required.')
    }
    return parseDocumentLines(request.text, String(request.fileName ?? 'document'))
  })
}