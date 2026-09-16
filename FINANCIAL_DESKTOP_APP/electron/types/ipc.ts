import type { Category, CategoryType } from '../categories/category.service'
import type { Transaction, TransactionFilters, TransactionInput, TransactionPage } from '../transactions/transaction.service'
import type { CalculationFilter, CalculationTotals, CategoryBreakdown, MonthlySummary } from '../calculations/types'
import type { ImportMapping, ImportPreview, ImportResult } from '../import/import.service'
import type { ExportRequest, ExportResult } from '../export/export.ipc'
import type { BackupRecord, BackupExportResult, RestoreFileResult } from '../database/backup.service'
import type { ResetResult } from '../database/reset.service'
import type { ParsedDocumentLine, ReadDocumentResult } from '../ocr/ocr.service'
import type { UpdateStatus } from '../updater/update-meta'

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: AppError }

export interface AppError {
  code: string
  message: string
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface AppInfo {
  appName: string
  version: string
  electron: string
  chromium: string
  node: string
  platform: string
  userDataPath: string
  logsDir: string
  mode: 'development' | 'production'
}

export interface PingResult {
  pong: true
  timestamp: string
}

export interface DatabaseStatus {
  connected: boolean
  path: string
  sizeBytes: number
  schemaVersion: number
}

export interface AppSettings {
  appName: string
  currency: string
  dateFormat: string
  theme: 'light' | 'dark' | 'system'
  defaultExportFolder: string
}

export interface FinancialEncoderApi {
  app: {
    ping(): Promise<IpcResult<PingResult>>
    getInfo(): Promise<IpcResult<AppInfo>>
  }
  db: {
    init(): Promise<IpcResult<DatabaseStatus>>
    getStatus(): Promise<IpcResult<DatabaseStatus>>
    reset(): Promise<IpcResult<ResetResult>>
  }
  settings: {
    getAll(): Promise<IpcResult<AppSettings>>
    set(key: keyof AppSettings, value: string): Promise<IpcResult<AppSettings>>
  }
  transactions: {
    list(filters?: TransactionFilters): Promise<IpcResult<TransactionPage>>
    get(id: number): Promise<IpcResult<Transaction | null>>
    create(tx: TransactionInput): Promise<IpcResult<Transaction>>
    update(id: number, partial: Partial<TransactionInput>): Promise<IpcResult<Transaction | null>>
    delete(id: number): Promise<IpcResult<boolean>>
  }
  categories: {
    list(type?: CategoryType): Promise<IpcResult<Category[]>>
    types(): Promise<IpcResult<string[]>>
    create(input: { name: string; type: CategoryType }): Promise<IpcResult<Category>>
  }
  calculations: {
    totals(filter?: CalculationFilter): Promise<IpcResult<CalculationTotals>>
    monthly(filter?: CalculationFilter): Promise<IpcResult<MonthlySummary[]>>
    byCategory(filter?: CalculationFilter): Promise<IpcResult<CategoryBreakdown[]>>
  }
  imports: {
    pick(): Promise<IpcResult<ImportPreview>>
    confirm(req: ImportMapping): Promise<IpcResult<ImportResult>>
  }
  exports: {
    file(req: ExportRequest): Promise<IpcResult<ExportResult>>
  }
  backups: {
    create(): Promise<IpcResult<BackupRecord>>
    list(): Promise<IpcResult<BackupRecord[]>>
    restore(id: number): Promise<IpcResult<DatabaseStatus>>
    delete(id: number): Promise<IpcResult<boolean>>
    export(): Promise<IpcResult<BackupExportResult>>
    importFromFile(): Promise<IpcResult<RestoreFileResult>>
  }
  ocr: {
    pick(): Promise<IpcResult<ReadDocumentResult>>
    parse(text: string, fileName: string): Promise<IpcResult<ParsedDocumentLine[]>>
  }
  logger: {
    log(level: LogLevel, message: string, context?: unknown): Promise<IpcResult<{ received: true }>>
  }
  updater: {
    check(): Promise<IpcResult<UpdateStatus>>
    download(): Promise<IpcResult<UpdateStatus>>
    install(): Promise<IpcResult<UpdateStatus>>
    onStatus(callback: (status: UpdateStatus) => void): () => void
  }
}

// Re-export types from services for convenience in renderer
export type { Transaction, TransactionFilters, TransactionInput, TransactionPage, TransactionType } from '../transactions/transaction.service'
export type { Category, CategoryType } from '../categories/category.service'
export type {
  CalculationFilter,
  CalculationTotals,
  CalculationType,
  CategoryBreakdown,
  MonthlySummary,
} from '../calculations/types'
export type {
  ImportField,
  ImportMapping,
  ImportPreview,
  ImportResult,
} from '../import/import.service'
export type { ExportFormat, ExportRequest, ExportResult } from '../export/export.ipc'
export type { BackupRecord, BackupExportResult, RestoreFileResult } from '../database/backup.service'
export type { ResetResult } from '../database/reset.service'
export type { DocumentKind, ParsedDocumentLine, ReadDocumentResult } from '../ocr/ocr.service'
export type { UpdateStatus } from '../updater/update-meta'