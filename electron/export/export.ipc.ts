import { app, BrowserWindow, dialog } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { registerIpcHandler, AppError } from '../services/ipc-handler'
import { logger } from '../services/logger.service'
import { getAllSettings } from '../database/settings'
import {
  buildCsvReport,
  buildHtmlReport,
  buildReportData,
  buildXlsxReport,
  validateExportFilter,
} from '../export/report.service'
import type { CalculationFilter } from '../calculations/types'

export type ExportFormat = 'csv' | 'xlsx' | 'pdf'

export interface ExportRequest {
  format: ExportFormat
  filter?: CalculationFilter
}

export interface ExportResult {
  filePath: string
  rows: number
  bytes: number
}

function safeFormat(value: unknown): ExportFormat {
  if (value === 'csv' || value === 'xlsx' || value === 'pdf') {
    return value
  }
  throw new AppError('VALIDATION_ERROR', 'Unsupported export format.')
}

function defaultFileName(format: ExportFormat): string {
  const stamp = new Date().toISOString().slice(0, 10)
  const ext = format === 'csv' ? 'csv' : format === 'xlsx' ? 'xlsx' : 'pdf'
  return `financial-report-${stamp}.${ext}`
}

/** Completes the chosen destination with the correct extension when omitted. */
function ensureExportExtension(filePath: string, format: ExportFormat): string {
  const ext = format === 'csv' ? 'csv' : format === 'xlsx' ? 'xlsx' : 'pdf'
  if (path.extname(filePath).toLowerCase() === `.${ext}`) {
    return filePath
  }
  return `${filePath}.${ext}`
}

function defaultExportPath(format: ExportFormat): string {
  const folder = getAllSettings().defaultExportFolder
  if (folder && fs.existsSync(folder)) {
    return path.join(folder, defaultFileName(format))
  }
  return path.join(app.getPath('documents'), defaultFileName(format))
}

async function renderPdfBuffer(html: string): Promise<Buffer> {
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  try {
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    const buffer = await window.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
    })
    return Buffer.from(buffer)
  } finally {
    window.destroy()
  }
}

export function registerExportIpcHandlers(): void {
  registerIpcHandler<ExportResult>('export:file', async (_event, raw) => {
    const request = (raw ?? {}) as Record<string, unknown>
    const format = safeFormat(request.format)
    const filter = validateExportFilter(request.filter)

    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const name = defaultFileName(format)
    const result = await dialog.showSaveDialog(win ?? undefined, {
      title: 'Export report',
      defaultPath: path.join(path.dirname(defaultExportPath(format)), name),
      filters: format === 'csv'
        ? [{ name: 'CSV', extensions: ['csv'] }]
        : format === 'xlsx'
          ? [{ name: 'Excel Workbook', extensions: ['xlsx'] }]
          : [{ name: 'PDF Document', extensions: ['pdf'] }],
    })

    if (result.canceled || !result.filePath) {
      throw new AppError('EXPORT_CANCELLED', 'Export cancelled.')
    }

    const destPath = ensureExportExtension(result.filePath, format)
    const data = buildReportData(filter, 'Financial Report')

    if (format === 'pdf') {
      const pdf = await renderPdfBuffer(buildHtmlReport(data))
      fs.writeFileSync(destPath, pdf)
      logger.info('export written', { filePath: destPath, format, rows: data.transactions.length, bytes: pdf.length })
      return { filePath: destPath, rows: data.transactions.length, bytes: pdf.length }
    }

    if (format === 'csv') {
      const buffer = Buffer.from(buildCsvReport(data), 'utf8')
      fs.writeFileSync(destPath, buffer)
      logger.info('export written', { filePath: destPath, format, rows: data.transactions.length, bytes: buffer.length })
      return { filePath: destPath, rows: data.transactions.length, bytes: buffer.length }
    }

    const buffer = await buildXlsxReport(data)
    fs.writeFileSync(destPath, buffer)
    logger.info('export written', { filePath: destPath, format, rows: data.transactions.length, bytes: buffer.length })
    return { filePath: destPath, rows: data.transactions.length, bytes: buffer.length }
  })
}